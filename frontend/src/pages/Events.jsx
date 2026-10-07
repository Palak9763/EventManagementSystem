import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import {
  Plus,
  CalendarDays,
  MapPin,
  Users,
  Clock,
  X,
  Pencil,
  Trash2,
  QrCode,
  User,
  AlertCircle,
  AlarmClock,
} from "lucide-react";

import {
  createEvent,
  getEvents,
  getVenues,
  updateEvent,
  deleteEvent,
  getStoredUser,
} from "../api";

import {
  errorMessage,
  formatDate,
  formatTime,
} from "../utils";

const CATEGORIES = [
  "Technical",
  "Cultural",
  "Sports",
  "Workshop",
  "Academic",
  "Social",
  "Seminar",
];

const emptyForm = {
  title: "",
  description: "",
  category: "Technical",
  start_date: "",
  end_date: "",
  capacity: "100",
  budget: "0",
  venue_id: "",
};

function toDateTimeLocal(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  );
}

function Events() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const currentUser = getStoredUser();
  const isAdmin = Boolean(
    currentUser?.is_staff ||
    currentUser?.role === "admin" ||
    currentUser?.role === "Admin"
  );
  const isOrganizer = Boolean(
    currentUser?.role === "organizer" ||
    currentUser?.role === "Organizer" ||
    currentUser?.is_verified_organizer
  );

  const isEventMine = (evt) => {
    if (!currentUser) return false;
    const orgId = String(evt.organizer?.id || evt.organizer_id || evt.organizer?.pk || "");
    const userId = String(currentUser.id || currentUser.pk || "");
    const orgUser = String(evt.organizer?.username || "");
    const username = String(currentUser.username || "");
    return (orgId && userId && orgId === userId) || (orgUser && username && orgUser === username);
  };

  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);

  const [category, setCategory] = useState("all");

  const [scope, setScope] = useState(isOrganizer && !isAdmin ? "mine" : "all");

  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    ...emptyForm,
  });

  const [selectedEvent, setSelectedEvent] = useState(null);

  const [editForm, setEditForm] = useState({
    ...emptyForm,
  });

  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleting, setDeleting] = useState(false);

  const search = searchParams.get("search") || "";

  /* =========================
     LOAD EVENTS + VENUES
  ========================== */

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const [eventData, venueData] = await Promise.all([
        getEvents({
          search,
          category:
            category === "all"
              ? undefined
              : category,
          upcoming:
            scope === "upcoming"
              ? "true"
              : undefined,
          mine:
            scope === "mine"
              ? "true"
              : undefined,
        }),

        getVenues(),
      ]);

      setEvents(
        Array.isArray(eventData)
          ? eventData
          : []
      );

      setVenues(
        Array.isArray(venueData)
          ? venueData
          : []
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, category, scope]);

  useEffect(() => {
    if (loading) return;
    const action = searchParams.get("action");
    if (action === "create") {
      openForm();
    }
    const editId = searchParams.get("edit");
    if (editId && events.length > 0) {
      const target = events.find((e) => String(e.id) === String(editId));
      if (target) {
        openManage(target);
      }
    }
  }, [loading, searchParams, events]);

  /* =========================
     COMPLETED EVENTS FILTER
  ========================== */

  const filteredEvents = useMemo(() => {
    let list = events;

    if (scope === "mine") {
      return list.filter(isEventMine);
    }

    if (scope === "all") {
      return list;
    }

    if (scope === "pending") {
      return list.filter((event) => event.status === "draft");
    }

    if (scope === "published") {
      return list.filter(
        (event) =>
          event.status === "published" &&
          (!event.end_date || new Date(event.end_date) >= new Date())
      );
    }

    if (scope === "upcoming") {
      return list.filter(
        (event) =>
          event.status === "published" &&
          (!event.start_date || new Date(event.start_date) >= new Date())
      );
    }

    if (scope === "completed") {
      return list.filter(
        (event) =>
          event.status === "completed" ||
          (event.end_date && new Date(event.end_date) < new Date())
      );
    }

    return list;
  }, [events, scope, currentUser]);

  /* =========================
     HELPERS
  ========================== */

  const categoryClass = (value) =>
    String(value || "")
      .toLowerCase()
      .replaceAll(" ", "-");

  /* =========================
     CREATE EVENT
  ========================== */

  const openForm = () => {
    setMessage("");
    setError("");
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const closeForm = () => {
    if (!saving) {
      setShowForm(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((old) => ({
      ...old,
      [name]: value,
    }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!form.title.trim()) {
      setError(
        "Please enter an event title."
      );
      return;
    }

    if (
      !form.start_date ||
      !form.end_date
    ) {
      setError(
        "Please select both the start and end date/time."
      );
      return;
    }

    if (
      new Date(form.end_date) <=
      new Date(form.start_date)
    ) {
      setError(
        "The end date/time must be after the start date/time."
      );
      return;
    }

    if (
      !Number.isInteger(
        Number(form.capacity)
      ) ||
      Number(form.capacity) < 1
    ) {
      setError(
        "Capacity must be a whole number greater than zero."
      );
      return;
    }

    try {
      setSaving(true);

      const payload = new FormData();
      payload.append("title", form.title.trim());
      payload.append("description", form.description.trim());
      payload.append("category", form.category);
      payload.append("start_date", new Date(form.start_date).toISOString());
      payload.append("end_date", new Date(form.end_date).toISOString());
      payload.append("capacity", Number(form.capacity));
      payload.append("budget", Number(form.budget || 0));
      if (form.venue_id) {
        payload.append("venue_id", form.venue_id);
      }
      if (form.image) {
        payload.append("image", form.image);
      }

      const created = await createEvent(payload);

      setShowForm(false);

      setMessage(
        created?.status === "draft"
          ? "Event submitted successfully! It is now pending admin approval."
          : "Event created successfully."
      );

      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     MANAGE EVENT
  ========================== */

  const openManage = (event) => {
    setMessage("");
    setError("");
    setEditError("");

    setSelectedEvent(event);

    setEditForm({
      title:
        event.title || "",

      description:
        event.description || "",

      category:
        event.category ||
        "Technical",

      start_date:
        toDateTimeLocal(
          event.start_date
        ),

      end_date:
        toDateTimeLocal(
          event.end_date
        ),

      capacity:
        String(
          event.capacity ?? 100
        ),

      budget:
        String(
          event.budget ?? 0
        ),

      venue_id:
        String(
          event.venue?.id ??
          event.venue_id ??
          ""
        ),
    });
  };

  const closeManage = () => {
    if (
      !savingEdit &&
      !deleting
    ) {
      setSelectedEvent(null);
      setEditError("");
    }
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;

    setEditForm((old) => ({
      ...old,
      [name]: value,
    }));
  };

  /* =========================
     UPDATE EVENT
  ========================== */

  const handleUpdate = async (e) => {
    e.preventDefault();

    setEditError("");

    if (isOngoingEvent(selectedEvent) && editForm.status === "cancelled") {
      const regCount = selectedEvent.registration_count ?? 0;
      if (regCount > 0) {
        setEditError(
          `Ongoing events cannot be cancelled while students are registered. ${regCount} student(s) are currently registered. Cancel all registrations first.`
        );
        return;
      }
    }

    if (!editForm.title.trim()) {
      setEditError(
        "Please enter an event title."
      );
      return;
    }

    if (
      !editForm.start_date ||
      !editForm.end_date
    ) {
      setEditError(
        "Please select both the start and end date/time."
      );
      return;
    }

    if (
      new Date(editForm.end_date) <=
      new Date(editForm.start_date)
    ) {
      setEditError(
        "The end date/time must be after the start date/time."
      );
      return;
    }

    if (
      !Number.isInteger(
        Number(editForm.capacity)
      ) ||
      Number(editForm.capacity) < 1
    ) {
      setEditError(
        "Capacity must be a whole number greater than zero."
      );
      return;
    }

    try {
      setSavingEdit(true);

      const payload = new FormData();
      payload.append("title", editForm.title.trim());
      payload.append("description", editForm.description.trim());
      payload.append("category", editForm.category);
      payload.append("start_date", new Date(editForm.start_date).toISOString());
      payload.append("end_date", new Date(editForm.end_date).toISOString());
      payload.append("capacity", Number(editForm.capacity));
      payload.append("budget", Number(editForm.budget || 0));
      if (editForm.venue_id) {
        payload.append("venue_id", editForm.venue_id);
      }
      if (editForm.image) {
        payload.append("image", editForm.image);
      }

      await updateEvent(selectedEvent.id, payload);

      setSelectedEvent(null);

      setMessage(
        "Event updated successfully."
      );

      await load();
    } catch (e) {
      setEditError(
        errorMessage(e)
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const isOngoingEvent = (evt) => {
    if (!evt || !evt.start_date || !evt.end_date) return false;
    const now = new Date();
    const start = new Date(evt.start_date);
    const end = new Date(evt.end_date);
    return start <= now && now <= end;
  };

  const handleDelete = async () => {
    if (!selectedEvent) {
      return;
    }

    if (isOngoingEvent(selectedEvent)) {
      setEditError("Ongoing events cannot be deleted while they are in progress.");
      return;
    }

    setEditError("");
    setError("");
    setMessage("");

    const eventId =
      selectedEvent.id;

    const eventTitle =
      selectedEvent.title;

    try {
      setDeleting(true);

      /*
       * Delete directly.
       * There is intentionally NO
       * window.confirm() here.
       */
      await deleteEvent(eventId);

      /*
       * Immediately remove deleted
       * event from UI.
       */
      setEvents((currentEvents) =>
        currentEvents.filter(
          (event) =>
            String(event.id) !==
            String(eventId)
        )
      );

      /*
       * Close manage modal.
       */
      setSelectedEvent(null);

      /*
       * Show success message.
       */
      setMessage(
        `"${eventTitle}" deleted successfully.`
      );

      /*
       * Reload from backend so UI
       * remains synchronized with MongoDB.
       */
      await load();
    } catch (e) {
      setEditError(
        errorMessage(e)
      );
    } finally {
      setDeleting(false);
    }
  };

  /* =========================
     MODAL STYLES
  ========================== */

  const modalOverlayStyle = {
    position: "fixed",
    inset: 0,
    background:
      "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 1000,
    overflowY: "auto",
  };

  const modalStyle = {
    background: "white",
    color: "#1e293b",
    width: "100%",
    maxWidth: "650px",
    maxHeight: "90vh",
    overflowY: "auto",
    borderRadius: "16px",
    padding: "26px",
    boxShadow:
      "0 20px 60px rgba(0,0,0,0.25)",
  };

  const fieldStyle = {
    display: "grid",
    gap: "6px",
  };

  const buttonRowStyle = {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "10px",
    marginTop: "24px",
  };

  /* =========================
     UI
  ========================== */

  return (
    <section className="page-content">

      {/* PAGE HEADER */}

      <div className="page-heading">

        <div>

          <p className="welcome-text">
            College Events
          </p>

          <h1>
            Events Directory
          </h1>

          <p className="page-description">
            Create and manage college events.
          </p>

        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openForm}
        >
          <Plus size={17} />
          Create Event
        </button>

      </div>

      {/* MESSAGE */}

      {message && (
        <p
          className="page-description"
          role="status"
          style={{
            color: "#16a34a",
          }}
        >
          {message}
        </p>
      )}

      {/* ERROR */}

      {error && (
        <p
          className="page-description"
          role="alert"
          style={{
            color: "#b91c1c",
          }}
        >
          {error}
        </p>
      )}

      {/* STATUS TABS */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        {[
          ...(isOrganizer ? [{ key: "mine", label: "My Created Events", count: events.filter(isEventMine).length }] : []),
          { key: "all", label: "All Campus Events", count: events.length },
          {
            key: "pending",
            label: "Pending Approval",
            count: events.filter((e) => e.status === "draft").length,
            highlight: events.filter((e) => e.status === "draft").length > 0,
          },
          {
            key: "published",
            label: "Published",
            count: events.filter(
              (e) => e.status === "published" && (!e.end_date || new Date(e.end_date) >= new Date())
            ).length,
          },
          {
            key: "completed",
            label: "Closed",
            count: events.filter(
              (e) => e.status === "completed" || (e.end_date && new Date(e.end_date) < new Date())
            ).length,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setScope(tab.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: scope === tab.key ? "1.5px solid #2563eb" : "1px solid #e2e8f0",
              backgroundColor: scope === tab.key ? "#eff6ff" : "#ffffff",
              color: scope === tab.key ? "#1d4ed8" : "#475569",
              fontWeight: scope === tab.key ? 600 : 500,
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span>{tab.label}</span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 7px",
                borderRadius: "10px",
                backgroundColor:
                  tab.highlight && tab.key === "pending"
                    ? "#fef3c7"
                    : scope === tab.key
                    ? "#dbeafe"
                    : "#f1f5f9",
                color:
                  tab.highlight && tab.key === "pending"
                    ? "#d97706"
                    : scope === tab.key
                    ? "#1d4ed8"
                    : "#64748b",
                fontWeight: 700,
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* FILTERS */}

      <div className="events-toolbar">

        <div className="events-filters">

          <select
            value={category}
            onChange={(e) =>
              setCategory(
                e.target.value
              )
            }
          >

            <option value="all">
              All Categories
            </option>

            {CATEGORIES.map(
              (item) => (
                <option
                  key={item}
                  value={item.toLowerCase()}
                >
                  {item}
                </option>
              )
            )}

          </select>

          <select
            value={scope}
            onChange={(e) =>
              setScope(
                e.target.value
              )
            }
          >

            {isOrganizer && (
              <option value="mine">
                My Created Events
              </option>
            )}

            <option value="all">
              All Campus Events
            </option>

            <option value="pending">
              Pending Approval
            </option>

            <option value="published">
              Published
            </option>

            <option value="upcoming">
              Upcoming
            </option>

            <option value="completed">
              Closed / Completed
            </option>

          </select>

        </div>

      </div>

      {/* EVENTS */}

      <div className="events-grid">

        {loading ? (

          <p className="page-description">
            Loading events...
          </p>

        ) : filteredEvents.length ===
          0 ? (

          <p className="page-description">
            No events found.
          </p>

        ) : (

          filteredEvents.map(
            (event) => {

              const now = new Date();
              const endDate = event.end_date ? new Date(event.end_date) : (event.start_date ? new Date(event.start_date) : null);
              const isPast = endDate ? endDate < now : false;
              const full = event.available_seats <= 0;
              const isCancelled = event.status === "cancelled";
              const isDraft = event.status === "draft";
              const isClosed = event.status === "completed" || isPast;

              const statusLabel = isCancelled
                ? "Cancelled"
                : isDraft
                ? "Pending Approval"
                : isClosed
                ? "Closed"
                : full
                ? "Full"
                : "Open";

              const statusClass = isCancelled
                ? "event-cancelled"
                : isDraft
                ? "event-pending"
                : isClosed
                ? "event-closed"
                : full
                ? "event-full"
                : "event-open";

              return (

                <div
                  className="event-card"
                  key={event.id}
                >

                  {event.image && (
                    <div style={{ width: '100%', height: '160px', overflow: 'hidden', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', marginBottom: '16px' }}>
                      <img src={event.image} alt={event.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}

                  <div className="event-card-header" style={{ marginTop: event.image ? '0' : '0' }}>

                    <span
                      className={`event-category ${categoryClass(
                        event.category
                      )}`}
                    >
                      {event.category}
                    </span>

                    <span className={statusClass}>
                      {statusLabel}
                    </span>

                  </div>

                  <h2>
                    {event.title}
                  </h2>

                  <p className="event-description">
                    {event.description ||
                      "College event."}
                  </p>

                  <div className="event-details">

                    <div>
                      <CalendarDays
                        size={17}
                      />

                      <span>
                        {formatDate(
                          event.start_date
                        )}
                      </span>
                    </div>

                    <div>
                      <Clock
                        size={17}
                      />

                      <span>
                        {formatTime(
                          event.start_date
                        )}
                      </span>
                    </div>

                    <div>
                      <MapPin
                        size={17}
                      />

                      <span>
                        {event.venue?.name ||
                          "Venue TBA"}
                      </span>
                    </div>

                    <div>
                      <Users
                        size={17}
                      />

                      <span>
                        {event.registration_count ??
                          0}
                        {" / "}
                        {event.capacity}
                        {" registered"}
                      </span>
                    </div>

                  </div>

                  {(() => {
                    const isOwnerOrAdmin = isAdmin || (
                      currentUser && (
                        String(event.organizer?.id || event.organizer_id || event.organizer?.pk || "") === String(currentUser.id || currentUser.pk || "") ||
                        String(event.organizer?.username || "") === String(currentUser.username || "")
                      )
                    );

                    if (!isOwnerOrAdmin) {
                      return (
                        <div className="event-action">
                          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                            Organized by {event.organizer?.username || "Organizer"}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div className="event-action" style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="manage-event-button"
                          onClick={() => openManage(event)}
                        >
                          <Pencil size={16} />
                          Manage
                        </button>

                        {(() => {
                          const isCompleted =
                            event.status === "completed" ||
                            event.status === "cancelled" ||
                            (event.end_date && new Date(event.end_date) < new Date());

                          return isCompleted ? (
                            <button
                              type="button"
                              className="manage-event-button"
                              style={{ backgroundColor: '#7c3aed', color: '#ffffff', border: 'none' }}
                              onClick={() => navigate(`/events/${event.id}/check-in`)}
                              title="View attendance list (read-only)"
                            >
                              <Users size={16} />
                              Attendance
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="manage-event-button"
                              style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none' }}
                              onClick={() => navigate(`/events/${event.id}/check-in`)}
                              title="Scan QR codes and mark attendance"
                            >
                              <QrCode size={16} />
                              Check-In
                            </button>
                          );
                        })()}
                      </div>
                    );
                  })()}

                </div>
              );
            }
          )

        )}

      </div>

      {/* =========================
          CREATE EVENT MODAL
      ========================== */}

      {showForm && (

        <div
          role="presentation"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeForm();
            }
          }}
          style={modalOverlayStyle}
        >

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-event-title"
            style={modalStyle}
          >

            <div className="event-modal-header">

              <div>

                <h2 id="create-event-title">
                  Create New Event
                </h2>

                <p>
                  Enter the event details below.
                </p>

              </div>

              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close form"
                className="modal-close-button"
              >
                <X size={22} />
              </button>

            </div>

            <form
              onSubmit={handleCreate}
            >

              <div
                style={{
                  display: "grid",
                  gap: "15px",
                }}
              >

                <label
                  style={fieldStyle}
                >
                  <span>
                    Event title *
                  </span>

                  <input
                    name="title"
                    value={form.title}
                    onChange={
                      handleChange
                    }
                    placeholder="Enter event title"
                    required
                    maxLength={200}
                    style={
                      inputStyle
                    }
                  />
                </label>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Description
                  </span>

                  <textarea
                    name="description"
                    value={
                      form.description
                    }
                    onChange={
                      handleChange
                    }
                    placeholder="Describe your event"
                    rows={3}
                    style={{
                      ...inputStyle,
                      resize:
                        "vertical",
                    }}
                  />
                </label>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Category *
                  </span>

                  <select
                    name="category"
                    value={
                      form.category
                    }
                    onChange={
                      handleChange
                    }
                    style={
                      inputStyle
                    }
                  >
                    {CATEGORIES.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <div className="event-date-fields">

                  <label
                    style={fieldStyle}
                  >
                    <span>
                      Start date &amp;
                      time *
                    </span>

                    <input
                      type="datetime-local"
                      name="start_date"
                      value={
                        form.start_date
                      }
                      onChange={
                        handleChange
                      }
                      required
                      style={
                        inputStyle
                      }
                    />
                  </label>

                  <label
                    style={fieldStyle}
                  >
                    <span>
                      End date &amp;
                      time *
                    </span>

                    <input
                      type="datetime-local"
                      name="end_date"
                      value={
                        form.end_date
                      }
                      onChange={
                        handleChange
                      }
                      required
                      style={
                        inputStyle
                      }
                    />
                  </label>

                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <label style={fieldStyle}>
                    <span>Capacity *</span>
                    <input
                      type="number"
                      name="capacity"
                      value={form.capacity}
                      onChange={handleChange}
                      min="1"
                      step="1"
                      required
                      style={inputStyle}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span>Budget (₹)</span>
                    <input
                      type="number"
                      name="budget"
                      value={form.budget}
                      onChange={handleChange}
                      min="0"
                      step="100"
                      placeholder="e.g. 5000"
                      style={inputStyle}
                    />
                  </label>
                </div>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Event Image
                  </span>

                  <input
                    type="file"
                    name="image"
                    accept="image/*"
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        image: e.target.files[0]
                      }));
                    }}
                    style={
                      inputStyle
                    }
                  />
                </label>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Venue
                  </span>

                  <select
                    name="venue_id"
                    value={form.venue_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">
                      Venue TBA (Assign Later)
                    </option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} (Capacity: {v.capacity})
                      </option>
                    ))}
                  </select>
                </label>

              </div>

              {error && (
                <p
                  role="alert"
                  className="modal-error"
                >
                  {error}
                </p>
              )}

              <div
                style={{
                  ...buttonRowStyle,
                  justifyContent:
                    "flex-end",
                }}
              >

                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  style={
                    secondaryButtonStyle
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="primary-button"
                >
                  {saving
                    ? "Creating..."
                    : "Create Event"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

      {/* =========================
          MANAGE EVENT MODAL
      ========================== */}

      {selectedEvent && (

        <div
          role="presentation"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              closeManage();
            }
          }}
          style={
            modalOverlayStyle
          }
        >

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-event-title"
            style={modalStyle}
          >

            <div className="event-modal-header">

              <div>

                <h2 id="manage-event-title">
                  Manage Event
                </h2>

                <p>
                  Edit event details and assign a venue.
                </p>

              </div>

              <button
                type="button"
                onClick={
                  closeManage
                }
                disabled={
                  savingEdit ||
                  deleting
                }
                aria-label="Close manage event"
                className="modal-close-button"
              >
                <X size={22} />
              </button>

            </div>

            <form
              onSubmit={handleUpdate}
            >

              <div
                style={{
                  display: "grid",
                  gap: "15px",
                }}
              >

                <label
                  style={fieldStyle}
                >
                  <span>
                    Event title *
                  </span>

                  <input
                    name="title"
                    value={
                      editForm.title
                    }
                    onChange={
                      handleEditChange
                    }
                    required
                    maxLength={200}
                    style={
                      inputStyle
                    }
                  />
                </label>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Description
                  </span>

                  <textarea
                    name="description"
                    value={
                      editForm.description
                    }
                    onChange={
                      handleEditChange
                    }
                    rows={3}
                    style={{
                      ...inputStyle,
                      resize:
                        "vertical",
                    }}
                  />
                </label>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Category *
                  </span>

                  <select
                    name="category"
                    value={
                      editForm.category
                    }
                    onChange={
                      handleEditChange
                    }
                    style={
                      inputStyle
                    }
                  >

                    {CATEGORIES.map(
                      (item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      )
                    )}

                  </select>
                </label>

                <div className="event-date-fields">

                  <label
                    style={fieldStyle}
                  >
                    <span>
                      Start date &amp;
                      time *
                    </span>

                    <input
                      type="datetime-local"
                      name="start_date"
                      value={
                        editForm.start_date
                      }
                      onChange={
                        handleEditChange
                      }
                      required
                      style={
                        inputStyle
                      }
                    />
                  </label>

                  <label
                    style={fieldStyle}
                  >
                    <span>
                      End date &amp;
                      time *
                    </span>

                    <input
                      type="datetime-local"
                      name="end_date"
                      value={
                        editForm.end_date
                      }
                      onChange={
                        handleEditChange
                      }
                      required
                      style={
                        inputStyle
                      }
                    />
                  </label>

                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <label style={fieldStyle}>
                    <span>Capacity *</span>
                    <input
                      type="number"
                      name="capacity"
                      value={editForm.capacity}
                      onChange={handleEditChange}
                      min="1"
                      step="1"
                      required
                      style={inputStyle}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span>Budget (₹)</span>
                    <input
                      type="number"
                      name="budget"
                      value={editForm.budget}
                      onChange={handleEditChange}
                      min="0"
                      step="100"
                      placeholder="e.g. 5000"
                      style={inputStyle}
                    />
                  </label>
                </div>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Assign venue
                  </span>

                  <select
                    name="venue_id"
                    value={
                      editForm.venue_id
                    }
                    onChange={
                      handleEditChange
                    }
                    style={
                      inputStyle
                    }
                  >

                    <option value="">
                      Venue TBA (not assigned)
                    </option>

                    {venues.map(
                      (venue) => (
                        <option
                          key={venue.id}
                          value={venue.id}
                        >
                          {venue.name}
                          {" — Capacity: "}
                          {venue.capacity}
                        </option>
                      )
                    )}

                  </select>

                  <small
                    style={{
                      color:
                        "#64748b",
                    }}
                  >
                    Choose a venue now, or leave it unassigned.
                  </small>

                </label>

                <label
                  style={fieldStyle}
                >
                  <span>
                    Event Image (Leave blank to keep existing)
                  </span>

                  <input
                    type="file"
                    name="image"
                    accept="image/*"
                    onChange={(e) => {
                      setEditForm((prev) => ({
                        ...prev,
                        image: e.target.files[0]
                      }));
                    }}
                    style={
                      inputStyle
                    }
                  />
                </label>

                <div className="manage-event-summary" style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "space-between" }}>
                  <div>
                    <strong>Registrations:</strong>{" "}
                    {selectedEvent.registration_count ?? 0} / {selectedEvent.capacity}
                  </div>

                  <div>
                    <strong>Budget:</strong> ₹{Number(selectedEvent.budget || 0).toLocaleString()}
                  </div>

                  <div>
                    <strong>Views:</strong> {selectedEvent.views_count ?? 0}
                  </div>
                </div>

              </div>

              {editError && (
                <p
                  role="alert"
                  className="modal-error"
                >
                  {editError}
                </p>
              )}

              {isOngoingEvent(selectedEvent) && (() => {
                const regCount = selectedEvent.registration_count ?? 0;
                if (regCount > 0) {
                  return (
                    <div style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
                      <AlarmClock size={16} /> Ongoing Event — Cancellation is blocked because <strong>&nbsp;{regCount} student(s)&nbsp;</strong> are currently registered. Cancel all registrations first.
                    </div>
                  );
                } else {
                  return (
                    <div style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px' }}>
                      <AlertCircle size={16} /> Ongoing Event — No students registered. You may cancel this event.
                    </div>
                  );
                }
              })()}

              {/* =========================
                  ACTION BUTTONS
              ========================== */}

              <div
                style={buttonRowStyle}
              >

                {/* DELETE */}

                <button
                  type="button"
                  onClick={
                    handleDelete
                  }
                  disabled={
                    savingEdit ||
                    deleting ||
                    isOngoingEvent(selectedEvent)
                  }
                  title={isOngoingEvent(selectedEvent) ? "Ongoing events cannot be deleted" : ""}
                  style={{
                    ...deleteButtonStyle,
                    opacity: isOngoingEvent(selectedEvent) ? 0.5 : 1,
                    cursor: isOngoingEvent(selectedEvent) ? "not-allowed" : "pointer"
                  }}
                >

                  <Trash2
                    size={17}
                  />

                  {deleting
                    ? "Deleting..."
                    : "Delete Event"}

                </button>

                {/* RIGHT BUTTONS */}

                <div
                  style={{
                    display:
                      "flex",
                    gap: "10px",
                  }}
                >

                  <button
                    type="button"
                    onClick={
                      closeManage
                    }
                    disabled={
                      savingEdit ||
                      deleting
                    }
                    style={
                      secondaryButtonStyle
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={
                      savingEdit ||
                      deleting
                    }
                    className="primary-button"
                  >
                    {savingEdit
                      ? "Saving..."
                      : "Save Changes"}
                  </button>

                </div>

              </div>

            </form>

          </div>

        </div>

      )}

    </section>
  );
}

/* =========================
   INPUT STYLE
========================== */

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border:
    "1px solid #cbd5e1",
  borderRadius: "8px",
  font: "inherit",
  background: "white",
  color: "#1e293b",
};

/* =========================
   SECONDARY BUTTON
========================== */

const secondaryButtonStyle = {
  padding: "10px 16px",
  border:
    "1px solid #cbd5e1",
  borderRadius: "8px",
  background: "white",
  color: "#334155",
  cursor: "pointer",
  font: "inherit",
};

/* =========================
   DELETE BUTTON
========================== */

const deleteButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "10px 16px",
  border:
    "1px solid #fecaca",
  borderRadius: "8px",
  background: "#fff1f2",
  color: "#dc2626",
  cursor: "pointer",
  font: "inherit",
  fontWeight: "600",
};

export default Events;