from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Avg, Count, Q, Case, When, Value, IntegerField, F
from django.utils import timezone

from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

from django.http import HttpResponse
import csv

from rest_framework_simplejwt.tokens import RefreshToken

from .models import Event, Feedback, Registration, UserProfile, Venue, Notification, PlatformFeedback

from .serializers import (
    EventSerializer,
    FeedbackSerializer,
    MeSerializer,
    RegistrationSerializer,
    UserLoginSerializer,
    UserProfileSerializer,
    UserRegistrationSerializer,
    UserSummarySerializer,
    VenueSerializer,
    NotificationSerializer,
    PlatformFeedbackSerializer,
)


# ============================================================
# EVENTS
# ============================================================

def is_admin_user(user):
    return (
        user.is_staff
        or user.groups.filter(name__iexact="Admin").exists()
    )


def is_organizer_user(user):
    return user.groups.filter(name__iexact="Organizer").exists()


def is_student_user(user):
    return user.groups.filter(name__iexact="Student").exists()

class EventListCreateView(generics.ListCreateAPIView):
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None  # MongoDB does not support Django's paginator

    def get_queryset(self):
        queryset = Event.objects.select_related(
            "organizer",
            "venue",
        ).prefetch_related(
            "registrations"
        ).all()

        search = self.request.query_params.get("search")
        category = self.request.query_params.get("category")
        status_param = self.request.query_params.get("status")
        upcoming = self.request.query_params.get("upcoming")
        venue = self.request.query_params.get("venue")
        include_archived = self.request.query_params.get("include_archived") in {"1", "true", "yes"}

        # Soft deletion / Archive filter
        if category and category.lower() == "archived":
            queryset = queryset.filter(Q(category__iexact="Archived") | Q(is_deleted=True) | Q(is_archived=True))
        elif status_param and status_param.lower() == "archived":
            queryset = queryset.filter(Q(status="archived") | Q(is_deleted=True) | Q(is_archived=True))
        elif not include_archived:
            queryset = queryset.filter(is_deleted=False)

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
            )

        if category and category.lower() not in {"all", "archived"}:
            queryset = queryset.filter(
                category__iexact=category
            )

        if status_param and status_param.lower() != "archived":
            queryset = queryset.filter(
                status=status_param.lower()
            )

        if upcoming in {"1", "true", "yes"}:
            queryset = queryset.filter(
                start_date__gte=timezone.now()
            )

        if venue:
            queryset = queryset.filter(
                venue_id=venue
            )

        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        interests = profile.interests if profile.interests else []
        
        if interests:
            queryset = queryset.annotate(
                is_recommended=Case(
                    When(category__in=interests, then=Value(1)),
                    default=Value(0),
                    output_field=IntegerField()
                )
            )

        user = self.request.user
        is_admin = user.is_staff or user.groups.filter(name__iexact="Admin").exists()
        is_organizer = user.groups.filter(name__iexact="Organizer").exists()

        mine = self.request.query_params.get("mine") in {"1", "true", "yes"}

        if mine:
            queryset = queryset.filter(organizer=user)
        elif is_admin:
            pass  # Admins see all events (draft, published, completed, cancelled, archived)
        elif is_organizer:
            # Organizers see all published/completed campus events + their own draft events
            queryset = queryset.filter(
                Q(status__in=["published", "completed"]) | Q(organizer=user)
            )
        else:
            # Students / Participants only see published and completed events
            queryset = queryset.filter(status__in=["published", "completed"])

        recommended = self.request.query_params.get("recommended")
        if recommended in {"1", "true", "yes"}:
            # Filter out events the user is already registered for
            registered_event_ids = Registration.objects.filter(
                user=self.request.user,
                status__in=["registered", "waitlisted", "checked-in"]
            ).values_list("event_id", flat=True)
            
            queryset = queryset.exclude(id__in=registered_event_ids)
            
            if interests:
                queryset = queryset.order_by("-is_recommended", "start_date")
            else:
                queryset = queryset.order_by("start_date")

        return queryset

    def perform_create(self, serializer):
        user = self.request.user

        is_admin = user.is_staff or user.groups.filter(name__iexact="Admin").exists()
        is_organizer = user.groups.filter(name__iexact="Organizer").exists()

        if not (is_admin or is_organizer):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only organizers and admins can create events.")

        # If created by Admin, publish directly; if created by Organizer, set to draft (pending admin approval)
        initial_status = "published" if is_admin else "draft"
        serializer.save(organizer=user, status=initial_status)
class EventDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Event.objects.select_related(
            "organizer",
            "venue",
        ).all()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Event.objects.filter(pk=instance.pk).update(views_count=F("views_count") + 1)
        instance.views_count += 1
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_update(self, serializer):
        event = self.get_object()

        if (
            event.organizer != self.request.user
            and not is_admin_user(self.request.user)
        ):
            self.permission_denied(self.request)

        now = timezone.now()
        is_ongoing = (
            event.start_date
            and event.end_date
            and event.start_date <= now <= event.end_date
        )

        new_status = serializer.validated_data.get("status")
        if is_ongoing and new_status == "cancelled":
            from rest_framework.exceptions import ValidationError
            registered_count = event.registrations.filter(status="registered").count()
            if registered_count > 0:
                raise ValidationError({
                    "detail": (
                        f"Ongoing events cannot be cancelled while students are registered. "
                        f"{registered_count} student(s) are currently registered. "
                        "Cancel all registrations first."
                    )
                })

        serializer.save()

    def perform_destroy(self, instance):
        if (
            instance.organizer != self.request.user
            and not is_admin_user(self.request.user)
        ):
            self.permission_denied(self.request)

        now = timezone.now()
        is_ongoing = (
            instance.start_date
            and instance.end_date
            and instance.start_date <= now <= instance.end_date
        )

        if is_ongoing:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Ongoing events cannot be deleted while they are in progress."})

        # Soft deletion: move to Archived category and status, mark timestamps
        instance.is_deleted = True
        instance.is_archived = True
        instance.status = "archived"
        instance.category = "Archived"
        instance.deleted_at = now
        instance.save(update_fields=["is_deleted", "is_archived", "status", "category", "deleted_at"])



# ============================================================
# USER PROFILE
# ============================================================

class UserProfileDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        requested_user_id = self.kwargs.get("pk")

        if (
            str(requested_user_id) != str(self.request.user.pk)
            and not self.request.user.is_staff
        ):
            self.permission_denied(self.request)

        profile, _ = UserProfile.objects.get_or_create(
            user=self.request.user
        )

        return profile


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        UserProfile.objects.get_or_create(
            user=self.request.user
        )

        return self.request.user


# ============================================================
# REGISTRATIONS
# ============================================================

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

class AdminVerifyOrganizerView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        user = request.user
        if not (user.is_staff or user.groups.filter(name__iexact="Admin").exists()):
            return Response({"error": "Only admins can verify organizers."}, status=status.HTTP_403_FORBIDDEN)
            
        try:
            profile = UserProfile.objects.get(user__pk=pk)
            is_verified = request.data.get("is_verified_organizer", True)
            profile.is_verified_organizer = is_verified
            profile.save()
            return Response({"message": "Organizer verification status updated.", "is_verified_organizer": is_verified})
        except UserProfile.DoesNotExist:
            return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)
class RegistrationListCreateView(generics.ListCreateAPIView):
    serializer_class = RegistrationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        queryset = Registration.objects.select_related(
            "user",
            "event",
            "event__organizer",
            "event__venue",
        ).prefetch_related(
            "event__registrations"
        )

        is_admin = (
            self.request.user.is_staff
            or self.request.user.groups.filter(
                name__iexact="Admin"
            ).exists()
        )

        # Admin can view all registrations
        if (
            is_admin
            and self.request.query_params.get("all")
            in {"1", "true", "yes"}
        ):
            return queryset.all()

        # Normal users can only view their own registrations
        queryset = queryset.filter(
            user=self.request.user
        )

        event = self.request.query_params.get("event")
        registration_status = self.request.query_params.get("status")

        if event:
            queryset = queryset.filter(
                event_id=event
            )

        if (
            registration_status
            and registration_status != "all"
        ):
            queryset = queryset.filter(
                status=registration_status
            )

        return queryset

class EventAttendeeListView(generics.ListAPIView):
    serializer_class = UserSummarySerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        event_id = self.kwargs.get("event_id")
        user = self.request.user
        
        is_admin = (
            user.is_staff
            or user.groups.filter(name__iexact="Admin").exists()
        )
        
        is_organizer = Event.objects.filter(id=event_id, organizer=user).exists()
        
        if not (is_admin or is_organizer):
            try:
                my_reg = Registration.objects.get(event_id=event_id, user=user)
                if not my_reg.connect_opt_in:
                    return User.objects.none()
            except Registration.DoesNotExist:
                return User.objects.none()
        
        queryset = User.objects.filter(
            registrations__event_id=event_id,
            registrations__connect_opt_in=True,
            registrations__status__in=["registered", "checked-in"]
        ).exclude(
            id=user.id
        ).distinct().select_related("profile").prefetch_related("registrations")
        
        return queryset
class RegistrationDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RegistrationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Registration.objects.select_related(
            "user",
            "event",
        )

        is_admin = (
            self.request.user.is_staff
            or self.request.user.groups.filter(
                name__iexact="Admin"
            ).exists()
        )

        if is_admin:
            return queryset

        return queryset.filter(
            user=self.request.user
        )

    def get_object(self):
        queryset = self.get_queryset()
        registration_id = self.kwargs.get("pk")

        try:
            registration = queryset.get(pk=registration_id)
        except Registration.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound("Registration not found.")

        return registration

    def perform_destroy(self, instance):
        now = timezone.now()
        event = instance.event
        if event and event.start_date and event.start_date <= now:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Registration cannot be cancelled for an event that is ongoing or already started."})

        instance.status = "cancelled"
        instance.checked_in = False
        instance.save(
            update_fields=["status", "checked_in"]
        )

class CheckInView(generics.GenericAPIView):
    """POST /api/registrations/check-in/  — accepts {qr_token} or pk in URL."""
    permission_classes = [IsAuthenticated]

    def _get_registration(self, request, pk):
        """Resolve registration by URL pk or by qr_token in POST body."""
        qr_token = request.data.get("qr_token")
        if qr_token:
            try:
                return Registration.objects.select_related(
                    "event", "event__organizer", "user", "user__profile"
                ).get(qr_token=qr_token)
            except Registration.DoesNotExist:
                return None
        # Fall back to pk from URL
        try:
            return Registration.objects.select_related(
                "event", "event__organizer", "user", "user__profile"
            ).get(pk=pk)
        except Registration.DoesNotExist:
            return None

    def post(self, request, pk=None):
        registration = self._get_registration(request, pk)

        if registration is None:
            return Response(
                {"detail": "Invalid ticket — registration not found.",
                 "code": "invalid_ticket"},
                status=status.HTTP_404_NOT_FOUND,
            )

        event = registration.event

        # Authorization: only event organizer or admin/staff
        is_organizer = (event.organizer == request.user)
        is_admin = (
            request.user.is_staff
            or request.user.groups.filter(name__iexact="Admin").exists()
        )
        if not (is_organizer or is_admin):
            return Response(
                {"detail": "Only the event organizer or admin can check in attendees.",
                 "code": "forbidden"},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()

        # Check-in Timing Guard: Block check-in prior to event start date/time
        if event.start_date:
            # Allow check-in up to 2 hours before the event start_date
            checkin_open_time = event.start_date - timezone.timedelta(hours=2)
            if now < checkin_open_time:
                formatted_time = event.start_date.strftime("%d %b %Y at %I:%M %p")
                return Response(
                    {
                        "detail": f"Check-in is not open yet. This event starts on {formatted_time}.",
                        "code": "checkin_not_open",
                        "event_start": event.start_date,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if event.end_date and now > event.end_date:
            return Response(
                {
                    "detail": "Check-in is closed because this event has ended.",
                    "code": "event_ended",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Already checked-in — return duplicate info
        if registration.checked_in:
            return Response(
                {
                    "detail": "Already checked in.",
                    "code": "already_checked_in",
                    "checked_in_at": registration.checked_in_at,
                    "student": {
                        "name": registration.user.get_full_name() or registration.user.username,
                        "email": registration.user.email,
                        "username": registration.user.username,
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )

        if registration.status not in ["registered", "waitlisted"]:
            return Response(
                {"detail": f"Cannot check in: registration status is '{registration.status}'.",
                 "code": "invalid_status"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Atomic update — prevents race conditions
        with transaction.atomic():
            updated = Registration.objects.filter(
                pk=registration.pk,
                checked_in=False,
            ).update(
                checked_in=True,
                checked_in_at=timezone.now(),
                checked_in_by=request.user,
                status="registered",
            )
            if not updated:
                # Raced to a double check-in
                registration.refresh_from_db()
                return Response(
                    {"detail": "Already checked in.",
                     "code": "already_checked_in",
                     "checked_in_at": registration.checked_in_at},
                    status=status.HTTP_409_CONFLICT,
                )

        registration.refresh_from_db()

        # Attendance stats
        total_registered = Registration.objects.filter(
            event=event, status__in=["registered", "checked-in"]
        ).count()
        total_checked_in = Registration.objects.filter(
            event=event, checked_in=True
        ).count()

        user = registration.user
        profile = getattr(user, "profile", None)

        return Response(
            {
                "detail": "Check-in successful.",
                "code": "success",
                "checked_in_at": registration.checked_in_at,
                "student": {
                    "id": str(user.pk),
                    "name": user.get_full_name() or user.username,
                    "email": user.email,
                    "username": user.username,
                    "registration_number": getattr(profile, "registration_number", ""),
                },
                "event": {
                    "id": str(event.pk),
                    "title": event.title,
                },
                "attendance": {
                    "total_registered": total_registered,
                    "total_checked_in": total_checked_in,
                    "percentage": round(
                        (total_checked_in / total_registered * 100) if total_registered else 0, 1
                    ),
                },
            },
            status=status.HTTP_200_OK,
        )


class EventAttendanceView(generics.GenericAPIView):
    """GET /api/<event_id>/attendance/ — full roster + metrics for organizer/admin."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            event = Event.objects.get(pk=pk)
        except Event.DoesNotExist:
            return Response({"detail": "Event not found."}, status=status.HTTP_404_NOT_FOUND)

        is_organizer = (event.organizer == request.user)
        is_admin = (
            request.user.is_staff
            or request.user.groups.filter(name__iexact="Admin").exists()
        )
        if not (is_organizer or is_admin):
            return Response(
                {"detail": "Only the event organizer or admin can view attendance."},
                status=status.HTTP_403_FORBIDDEN,
            )

        registrations = Registration.objects.filter(
            event=event,
            status__in=["registered", "waitlisted"],
        ).select_related("user", "user__profile", "checked_in_by").order_by("-checked_in", "registered_at")

        total_registered = registrations.filter(status="registered").count()
        total_checked_in = registrations.filter(checked_in=True).count()

        attendees = []
        for reg in registrations:
            u = reg.user
            profile = getattr(u, "profile", None)
            attendees.append({
                "registration_id": str(reg.pk),
                "qr_token": reg.qr_token,
                "status": reg.status,
                "checked_in": reg.checked_in,
                "checked_in_at": reg.checked_in_at,
                "checked_in_by": (
                    reg.checked_in_by.get_full_name() or reg.checked_in_by.username
                ) if reg.checked_in_by else None,
                "registered_at": reg.registered_at,
                "student": {
                    "id": str(u.pk),
                    "name": u.get_full_name() or u.username,
                    "email": u.email,
                    "username": u.username,
                    "registration_number": getattr(profile, "registration_number", ""),
                },
            })

        return Response({
            "event": {
                "id": str(event.pk),
                "title": event.title,
                "capacity": event.capacity,
                "start_date": event.start_date,
                "end_date": event.end_date,
            },
            "summary": {
                "total_registered": total_registered,
                "total_checked_in": total_checked_in,
                "total_not_arrived": total_registered - total_checked_in,
                "percentage": round(
                    (total_checked_in / total_registered * 100) if total_registered else 0, 1
                ),
            },
            "attendees": attendees,
        })


# ============================================================
# FEEDBACK
# ============================================================

class FeedbackListCreateView(
    generics.ListCreateAPIView
):
    serializer_class = FeedbackSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Feedback.objects.select_related(
            "user",
            "event",
            "event__organizer",
            "event__venue",
        ).prefetch_related(
            "event__registrations",
        )

        if (
            self.request.user.is_staff
            and self.request.query_params.get("all")
            in {"1", "true", "yes"}
        ):
            return queryset

        return queryset.filter(
            user=self.request.user
        )


class FeedbackDetailView(
    generics.RetrieveUpdateDestroyAPIView
):
    serializer_class = FeedbackSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Feedback.objects.select_related(
            "user",
            "event",
            "event__organizer",
            "event__venue",
        ).prefetch_related(
            "event__registrations",
        )

        if self.request.user.is_staff:
            return queryset

        return queryset.filter(
            user=self.request.user
        )


class OrganizerFeedbackReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            feedback = Feedback.objects.get(pk=pk, is_deleted=False)
        except Feedback.DoesNotExist:
            return Response({"detail": "Feedback not found."}, status=status.HTTP_404_NOT_FOUND)

        if not (request.user.is_staff or feedback.event.organizer == request.user):
            return Response({"detail": "Only event organizers can reply to feedback."}, status=status.HTTP_403_FORBIDDEN)

        reply = request.data.get("organizer_reply", "").strip()
        if not reply:
            return Response({"detail": "Reply text is required."}, status=status.HTTP_400_BAD_REQUEST)

        feedback.organizer_reply = reply
        feedback.replied_at = timezone.now()
        feedback.save()

        serializer = FeedbackSerializer(feedback)
        return Response(serializer.data, status=status.HTTP_200_OK)


class PlatformFeedbackListCreateView(generics.ListCreateAPIView):
    serializer_class = PlatformFeedbackSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        queryset = PlatformFeedback.objects.select_related("user").filter(is_deleted=False)
        if self.request.user.is_staff:
            return queryset
        return queryset.filter(user=self.request.user)

class PlatformFeedbackDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PlatformFeedbackSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = PlatformFeedback.objects.select_related("user")
        if self.request.user.is_staff:
            return queryset
        return queryset.filter(user=self.request.user)

    def perform_destroy(self, instance):
        now = timezone.now()
        instance.is_deleted = True
        instance.is_archived = True
        instance.category = "Archived"
        instance.deleted_at = now
        instance.save(update_fields=["is_deleted", "is_archived", "category", "deleted_at"])


# ============================================================
# VENUES
# ============================================================

class VenueListCreateView(
    generics.ListCreateAPIView
):
    serializer_class = VenueSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        category = self.request.query_params.get("category")
        include_archived = self.request.query_params.get("include_archived") in {"1", "true", "yes"}

        if category and category.lower() == "archived":
            queryset = Venue.objects.filter(Q(category__iexact="Archived") | Q(is_deleted=True) | Q(is_archived=True))
        elif not include_archived:
            queryset = Venue.objects.filter(is_deleted=False)
        else:
            queryset = Venue.objects.all()

        search = self.request.query_params.get("search")
        availability = self.request.query_params.get(
            "availability"
        )

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(location__icontains=search)
            )

        if category and category.lower() not in {"all", "archived"}:
            queryset = queryset.filter(category__iexact=category)

        if availability == "available":
            queryset = queryset.filter(
                is_available=True
            )

        elif availability == "booked":
            queryset = queryset.filter(
                is_available=False
            )

        return queryset

    def perform_create(self, serializer):
        if not (is_admin_user(self.request.user) or is_organizer_user(self.request.user)):
            self.permission_denied(
                self.request,
                message="Only administrators and organizers can create venues."
            )
        serializer.save()

class VenueDetailView(
    generics.RetrieveUpdateDestroyAPIView
):
    queryset = Venue.objects.all()
    serializer_class = VenueSerializer
    permission_classes = [IsAuthenticated]

    def perform_update(self, serializer):
        if not (is_admin_user(self.request.user) or is_organizer_user(self.request.user)):
            self.permission_denied(
                self.request,
                message="Only administrators and organizers can update venues."
            )
        serializer.save()

    def perform_destroy(self, instance):
        if not (is_admin_user(self.request.user) or is_organizer_user(self.request.user)):
            self.permission_denied(self.request)

        now = timezone.now()

        # Block deletion if this venue is assigned to any upcoming or ongoing events
        conflicting_events = Event.objects.filter(
            venue=instance,
            is_deleted=False,
        ).filter(
            # Upcoming: starts in future
            # Ongoing: already started but not yet ended
            end_date__gte=now,
        ).exclude(status__in=["cancelled", "archived"])

        if conflicting_events.exists():
            from rest_framework.exceptions import ValidationError
            event_list = ", ".join(
                f'"{e.title}" ({e.status})'
                for e in conflicting_events[:5]
            )
            raise ValidationError({
                "detail": (
                    f"Cannot archive this venue — it is assigned to upcoming or ongoing events: {event_list}. "
                    f"Please change the venue for those events first, or wait for ongoing events to complete."
                ),
                "code": "venue_in_use",
                "conflicting_events": [
                    {
                        "id": str(e.pk),
                        "title": e.title,
                        "status": e.status,
                        "start_date": e.start_date,
                        "end_date": e.end_date,
                    }
                    for e in conflicting_events[:10]
                ],
            })

        instance.is_deleted = True
        instance.is_archived = True
        instance.category = "Archived"
        instance.is_available = False
        instance.deleted_at = now
        instance.save(update_fields=["is_deleted", "is_archived", "category", "is_available", "deleted_at"])


# ============================================================
# AUTHENTICATION
# ============================================================

class UserRegistrationView(
    generics.CreateAPIView
):
    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]


class UserLoginView(
    generics.GenericAPIView
):
    serializer_class = UserLoginSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        user = serializer.validated_data["user"]

        refresh = RefreshToken.for_user(user)

        UserProfile.objects.get_or_create(
            user=user
        )

        return Response(
            {
                "message": "Login successful.",
                "user": UserSummarySerializer(
                    user
                ).data,
                "role": serializer.validated_data.get(
                    "role",
                    "",
                ),
                "access": str(
                    refresh.access_token
                ),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


# ============================================================
# PARTICIPANTS
# ============================================================

class ParticipantListView(
    generics.ListAPIView
):
    serializer_class = UserSummarySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        
        is_staff_or_organizer = (
            user.is_staff
            or user.groups.filter(name__iexact="Admin").exists()
            or user.groups.filter(name__iexact="Organizer").exists()
        )

        if is_staff_or_organizer:
            queryset = User.objects.exclude(is_superuser=True).distinct().select_related("profile").prefetch_related("registrations")
        else:
            queryset = User.objects.filter(
                registrations__event__organizer=user
            ).distinct().select_related("profile").prefetch_related("registrations")

        search = self.request.query_params.get(
            "search"
        )

        if search:
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )

        return queryset


# ============================================================
# ADMIN - USERS
# ============================================================

class AdminUserListView(
    generics.ListAPIView
):
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get(self, request, *args, **kwargs):
        is_admin = (
            request.user.is_staff
            or request.user.groups.filter(
                name__iexact="Admin"
            ).exists()
        )

        if not is_admin:
            return Response(
                {
                    "detail": "Admin access required."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        users = User.objects.all().order_by(
            "username"
        )

        search = request.query_params.get(
            "search",
            "",
        ).strip()

        if search:
            users = users.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )

        data = []

        for user in users:
            try:
                if user.is_staff or user.is_superuser or user.groups.filter(name__iexact="Admin").exists():
                    role = "Admin"
                elif user.groups.filter(name__iexact="Organizer").exists():
                    role = "Organizer"
                elif user.groups.filter(name__iexact="Student").exists():
                    role = "Student"
                else:
                    role = "User"
            except Exception:
                role = "Admin" if user.is_staff else "User"

            data.append(
                {
                    "id": str(user.pk),
                    "username": user.username,
                    "name": (
                        user.get_full_name().strip()
                        or user.username
                    ),
                    "email": user.email,
                    "role": role,
                    "status": (
                        "Active"
                        if user.is_active
                        else "Inactive"
                    ),
                    "date_joined": user.date_joined,
                }
            )

        return Response(data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_user_status_view(request, pk):
    """
    Admin-only endpoint to activate/deactivate a user.
    PATCH /api/events/admin/users/<pk>/status/
    Body: { "is_active": boolean }
    """
    is_admin = (
        request.user.is_staff
        or request.user.groups.filter(name__iexact="Admin").exists()
    )

    if not is_admin:
        return Response(
            {"detail": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {"detail": "User not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Don't allow admins to deactivate themselves
    if user == request.user:
        return Response(
            {"detail": "You cannot deactivate your own account."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    is_active = request.data.get("is_active")
    if is_active is not None:
        user.is_active = bool(is_active)
        user.save(update_fields=["is_active"])

    return Response(
        {
            "id": str(user.pk),
            "username": user.username,
            "status": "Active" if user.is_active else "Inactive",
            "detail": f"User {'activated' if user.is_active else 'deactivated'} successfully.",
        }
    )


# ============================================================
# ADMIN - EVENTS
# ============================================================

class AdminEventListView(
    generics.ListAPIView
):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        is_admin = (
            request.user.is_staff
            or request.user.groups.filter(
                name__iexact="Admin"
            ).exists()
        )

        if not is_admin:
            return Response(
                {
                    "detail": "Admin access required."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        events = (
            Event.objects
            .select_related(
                "organizer",
                "venue",
            )
            .prefetch_related(
                "registrations"
            )
            .all()
        )

        search = request.query_params.get(
            "search",
            "",
        ).strip()

        if search:
            events = events.filter(
                Q(title__icontains=search)
                | Q(category__icontains=search)
                | Q(
                    organizer__username__icontains=search
                )
                | Q(
                    organizer__first_name__icontains=search
                )
                | Q(
                    organizer__last_name__icontains=search
                )
            )

        now = timezone.now()

        data = []

        for event in events:
            registrations = sum(1 for r in event.registrations.all() if r.status == "registered")

            if event.end_date and event.end_date < now:
                time_status = "Completed"
            elif event.start_date and event.start_date <= now:
                time_status = "Ongoing"
            else:
                time_status = "Upcoming"

            organizer_name = (
                event.organizer
                .get_full_name()
                .strip()
                or event.organizer.username
            )

            data.append(
                {
                    "id": str(event.pk),
                    "title": event.title,
                    "description": event.description,
                    "category": event.category,
                    "organizer": organizer_name,
                    "start_date": event.start_date,
                    "end_date": event.end_date,
                    "registrations": registrations,
                    "capacity": event.capacity,
                    "status": event.status,
                    "time_status": time_status,
                }
            )

        return Response(data)


# ============================================================
# DASHBOARD
# ============================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_view(request):
    now = timezone.now()

    # Overall system statistics
    total_users = User.objects.count()

    total_events = Event.objects.count()

    upcoming_events_count = Event.objects.filter(
        start_date__gte=now
    ).count()

    total_venues = Venue.objects.count()

    active_venues = Venue.objects.filter(
        is_available=True
    ).count()

    total_registrations = Registration.objects.count()

    # Current logged-in user's registrations
    my_registrations = Registration.objects.filter(
        user=request.user,
        status__in=[
            "registered",
            "waitlisted",
        ],
    ).count()

    # Upcoming events for dashboard
    upcoming = (
        Event.objects
        .filter(
            start_date__gte=now
        )
        .select_related("venue", "organizer")
        .prefetch_related("registrations")
        .order_by("start_date")[:5]
    )

    # Events grouped by category
    category_counts = {
        item["category"]: item["count"]
        for item in (
            Event.objects
            .values("category")
            .annotate(
                count=Count("id")
            )
        )
    }

    return Response(
        {
            "statistics": {
                "total_users": total_users,
                "total_participants": total_users,
                "total_events": total_events,
                "upcoming_events": upcoming_events_count,
                "total_venues": total_venues,
                "active_venues": active_venues,
                "total_registrations": total_registrations,
                "my_registrations": my_registrations,
            },

            "category_counts": category_counts,

            "upcoming_events": EventSerializer(
                upcoming,
                many=True,
                context={
                    "request": request
                },
            ).data,
        }
    )
    
# ============================================================
# STUDENT DASHBOARD
# ============================================================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_dashboard_view(request):
    user = request.user
    now = timezone.now()

    registrations = Registration.objects.filter(
        user=user
    )

    registered = registrations.filter(
        status="registered"
    ).count()

    waitlisted = registrations.filter(
        status="waitlisted"
    ).count()

    cancelled = registrations.filter(
        status="cancelled"
    ).count()

    checked_in = registrations.filter(
        status="registered",
        checked_in=True,
    ).count()

    upcoming_events = Event.objects.filter(
        registrations__user=user,
        registrations__status__in=[
            "registered",
            "waitlisted",
        ],
        start_date__gte=now,
    ).select_related(
        "organizer",
        "venue",
    ).prefetch_related(
        "registrations"
    ).distinct().order_by(
        "start_date"
    )[:5]

    recommended_events = Event.objects.filter(
        start_date__gte=now
    ).exclude(
        registrations__user=user
    ).select_related(
        "organizer",
        "venue",
    ).prefetch_related(
        "registrations"
    ).order_by(
        "start_date"
    )[:5]

    return Response({
        "statistics": {
            "registered": registered,
            "waitlisted": waitlisted,
            "cancelled": cancelled,
            "checked_in": checked_in,
        },
        "upcoming_events": EventSerializer(
            upcoming_events,
            many=True,
            context={"request": request},
        ).data,
        "recommended_events": EventSerializer(
            recommended_events,
            many=True,
            context={"request": request},
        ).data,
    })


# ============================================================
# REPORTS
# ============================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reports_view(request):
    user = request.user
    is_admin = (
        user.is_staff
        or user.groups.filter(name__iexact="Admin").exists()
    )
    is_organizer_or_admin = (
        is_admin
        or user.groups.filter(name__iexact="Organizer").exists()
    )

    if is_organizer_or_admin:
        events = Event.objects.all()
        registrations = Registration.objects.all()
        feedbacks = Feedback.objects.all()
    else:
        events = Event.objects.filter(organizer=user)
        registrations = Registration.objects.filter(event__organizer=user)
        feedbacks = Feedback.objects.filter(event__organizer=user)

    total_registrations = registrations.count()

    registered = registrations.filter(
        status="registered"
    ).count()

    waitlisted = registrations.filter(
        status="waitlisted"
    ).count()

    cancelled = registrations.filter(
        status="cancelled"
    ).count()

    checked_in = registrations.filter(
        status="registered",
        checked_in=True,
    ).count()

    no_shows = registrations.filter(
        status="no-show"
    ).count()

    feedback_stats = feedbacks.aggregate(
        average_rating=Avg("rating"),
        review_count=Count("id"),
        avg_content=Avg("rating_content"),
        avg_venue=Avg("rating_venue"),
        avg_value=Avg("rating_value"),
        avg_org=Avg("rating_organization"),
    )

    event_rows = []

    for event in events.select_related(
        "venue"
    ).prefetch_related(
        "registrations"
    ):

        registrations_list = event.registrations.all()
        reg_count = sum(1 for r in registrations_list if r.status == "registered")
        attendance = sum(1 for r in registrations_list if r.status == "registered" and r.checked_in)
        no_show = sum(1 for r in registrations_list if r.status == "no-show")

        total_expected = reg_count + no_show

        event_rows.append(
            {
                "event_id": str(event.pk),
                "event": event.title,
                "category": event.category,
                "budget": float(event.budget or 0),
                "views": event.views_count or 0,
                "registrations": reg_count,
                "attendance": attendance,
                "no_shows": no_show,
                "attendance_rate": round(
                    (
                        attendance
                        / total_expected
                        * 100
                    )
                    if total_expected
                    else 0,
                    1,
                ),
                "no_show_rate": round(
                    (
                        no_show
                        / total_expected
                        * 100
                    )
                    if total_expected
                    else 0,
                    1,
                ),
            }
        )

    response_data = {
        "total_events": events.count(),
        "total_registrations": total_registrations,
        "registered": registered,
        "waitlisted": waitlisted,
        "cancelled": cancelled,
        "no_shows": no_shows,
        "total_attendance": checked_in,
        "attendance_rate": round((checked_in / registered * 100) if registered else 0, 1),
        "average_rating": round(feedback_stats["average_rating"] or 0, 2),
        "review_count": feedback_stats["review_count"],
        "feedback_themes": {
            "content": round(feedback_stats["avg_content"] or 0, 2),
            "venue": round(feedback_stats["avg_venue"] or 0, 2),
            "value": round(feedback_stats["avg_value"] or 0, 2),
            "organization": round(feedback_stats["avg_org"] or 0, 2),
        },
        "event_performance": event_rows,
    }

    if is_admin:
        # Venue utilization
        venues = Venue.objects.annotate(event_count=Count('events')).values('name', 'event_count')
        response_data['venue_utilization'] = list(venues)

        # Engagement (students with >0 registrations)
        active_students = UserProfile.objects.filter(user__registrations__isnull=False).distinct().count()
        total_students = UserProfile.objects.count()
        response_data['student_engagement'] = {
            "total_students": total_students,
            "active_students": active_students,
            "engagement_rate": round((active_students / total_students * 100) if total_students else 0, 1)
        }
        
    return Response(response_data)
    
# ============================================================
# STUDENT REPORTS
# ============================================================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_reports_view(request):
    user = request.user

    registrations = Registration.objects.filter(
        user=user
    )

    total_registrations = registrations.count()

    registered = registrations.filter(
        status="registered"
    ).count()

    waitlisted = registrations.filter(
        status="waitlisted"
    ).count()

    cancelled = registrations.filter(
        status="cancelled"
    ).count()

    checked_in = registrations.filter(
        status="registered",
        checked_in=True,
    ).count()

    feedback_given = Feedback.objects.filter(
        user=user
    ).count()

    return Response({
        "total_registrations": total_registrations,
        "registered": registered,
        "waitlisted": waitlisted,
        "cancelled": cancelled,
        "checked_in": checked_in,
        "feedback_given": feedback_given,
    })


# ============================================================
# ADMIN — EVENT STATUS CHANGE
# ============================================================

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def admin_event_status_view(request, pk):
    """
    Admin-only endpoint to change an event's status.
    PATCH /api/events/admin/events/<pk>/status/
    Body: { "status": "published" | "cancelled" | "draft" | "completed" }
    """
    is_admin = (
        request.user.is_staff
        or request.user.groups.filter(name__iexact="Admin").exists()
    )

    if not is_admin:
        return Response(
            {"detail": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        event = Event.objects.get(pk=pk)
    except Event.DoesNotExist:
        return Response(
            {"detail": "Event not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    new_status = request.data.get("status", "").lower()
    valid_statuses = [s[0] for s in Event.STATUS_CHOICES]

    if new_status not in valid_statuses:
        return Response(
            {
                "detail": (
                    f"Invalid status '{new_status}'. "
                    f"Choose from: {', '.join(valid_statuses)}."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    is_ongoing = (
        event.start_date
        and event.end_date
        and event.start_date <= now <= event.end_date
    )
    if is_ongoing and new_status == "cancelled":
        registered_count = event.registrations.filter(status="registered").count()
        if registered_count > 0:
            return Response(
                {
                    "detail": (
                        f"Ongoing events cannot be cancelled while students are registered. "
                        f"{registered_count} student(s) are currently registered. "
                        "Cancel all registrations first."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    event.status = new_status
    event.save(update_fields=["status"])

    return Response(
        {
            "id": str(event.pk),
            "title": event.title,
            "status": event.status,
            "detail": f"Event status updated to '{new_status}'.",
        }
    )

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_export_events_csv(request):
    """
    Admin-only endpoint to export events as CSV.
    """
    is_admin = (
        request.user.is_staff
        or request.user.groups.filter(name__iexact="Admin").exists()
    )

    if not is_admin:
        return Response(
            {"detail": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="events_export.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Event ID", "Title", "Category", "Status",
        "Start Date", "End Date", "Capacity",
        "Total Registered", "Organizer"
    ])

    events = Event.objects.all().prefetch_related("registrations")
    for event in events:
        registered_count = event.registrations.filter(status="registered").count()
        writer.writerow([
            str(event.pk),
            event.title,
            event.category,
            event.status,
            event.start_date.strftime("%Y-%m-%d %H:%M:%S") if event.start_date else "",
            event.end_date.strftime("%Y-%m-%d %H:%M:%S") if event.end_date else "",
            event.capacity,
            registered_count,
            event.organizer.username if event.organizer else ""
        ])

    return response


# ============================================================
# HEALTH CHECK
# ============================================================

@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health_view(request):
    return Response(
        {
            "status": "ok",
            "service": "college-event-management-api",
            "database": "mongodb",
        }
    )


# ============================================================
# NOTIFICATIONS
# ============================================================

class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        category = self.request.query_params.get("category")
        if category and category.lower() == "archived":
            return Notification.objects.filter(
                user=self.request.user
            ).filter(Q(category__iexact="Archived") | Q(is_deleted=True) | Q(is_archived=True))

        return Notification.objects.filter(
            user=self.request.user,
            is_deleted=False,
        )

    def delete(self, request, *args, **kwargs):
        """Soft delete / clear all notifications for the user."""
        now = timezone.now()
        Notification.objects.filter(user=request.user, is_deleted=False).update(
            is_deleted=True,
            is_archived=True,
            category="Archived",
            deleted_at=now,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationDetailView(generics.UpdateAPIView, generics.DestroyAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(
            user=self.request.user,
        )

    def perform_update(self, serializer):
        # We only support marking as read
        serializer.save(is_read=True)

    def perform_destroy(self, instance):
        now = timezone.now()
        instance.is_deleted = True
        instance.is_archived = True
        instance.category = "Archived"
        instance.deleted_at = now
        instance.save(update_fields=["is_deleted", "is_archived", "category", "deleted_at"])