import { useState, useEffect } from "react";
import { useLocation, NavLink, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import { logout, getMe, getNotifications, markNotificationRead } from "./api";

import {
  LayoutDashboard,
  CalendarDays,
  Users,
  MapPin,
  ClipboardList,
  BarChart3,
  Settings,
  Bell,
  Search,
  Check,
  X,
  LogOut,
} from "lucide-react";

import "./App.css";

import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import Participants from "./pages/Participants";
import Reports from "./pages/Reports";
import SettingsPage from "./pages/Settings";

import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminEvents from "./pages/AdminEvents";
import AdminVenues from "./pages/AdminVenues";
import AdminRegistrations from "./pages/AdminRegistrations";
import AdminFeedback from "./pages/AdminFeedback";
import AdminReports from "./pages/AdminReports";

import StudentDashboard from "./pages/StudentDashboard";
import StudentEvents from "./pages/StudentEvents";
import StudentMyEvents from "./pages/StudentMyEvents";
import StudentEventHistory from "./pages/StudentEventHistory";
import StudentRecommendations from "./pages/StudentRecommendations";
import StudentFeedback from "./pages/StudentFeedback";
import StudentNotifications from "./pages/StudentNotifications";
import StudentReports from "./pages/StudentReports";
import StudentSettings from "./pages/StudentSettings";
import OrganizerCheckIn from "./pages/OrganizerCheckIn";

function ProtectedRoute({ children }) {
  const accessToken =
    sessionStorage.getItem("college_event_access") ||
    sessionStorage.getItem("access_token");

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function getUserDisplayName(user, fallbackRole) {
  if (!user) return fallbackRole;
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  if (fullName) return fullName;
  if (user.name) return user.name;
  if (user.username) return user.username;
  return fallbackRole;
}

function getUserAvatarInitial(user, fallbackRole) {
  const displayName = getUserDisplayName(user, fallbackRole);
  return displayName ? displayName.charAt(0).toUpperCase() : fallbackRole.charAt(0).toUpperCase();
}

function App() {
  const location = useLocation();

  const isAdmin = location.pathname.startsWith("/admin");
  const isStudent = location.pathname.startsWith("/student");

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("college_event_user") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Only try to fetch the profile if they aren't on the login page
    if (location.pathname !== "/login") {
      getMe()
        .then((data) => {
          if (data && data.id) {
            setCurrentUser(data);
          }
        })
        .catch(() => {
          // Ignore - ProtectedRoute will handle redirect if token is completely invalid
        });
    }
  }, [location.pathname]);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (currentUser) {
      getNotifications()
        .then((data) => setNotifications(data))
        .catch((err) => console.error("Failed to load notifications", err));
    }
  }, [currentUser]);

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read
  ).length;

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter((n) => !n.is_read);
      for (const n of unread) {
        await markNotificationRead(n.id);
      }
      setNotifications((old) =>
        old.map((notification) => ({
          ...notification,
          is_read: true,
        }))
      );
    } catch (error) {
      console.error(error);
    }
  };

  const markAsRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications((old) =>
        old.map((notification) =>
          notification.id === id
            ? {
                ...notification,
                is_read: true,
              }
            : notification
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Routes>

      {/* =========================
          LOGIN
      ========================== */}

      <Route
        path="/login"
        element={<Login />}
      />

      {/* =========================
          MAIN APPLICATION
      ========================== */}

      <Route
        path="*"
        element={
          <div className="app-container">

            {/* =========================
                SIDEBAR
            ========================== */}

            <aside className="sidebar">

              <div className="logo-section">

                <div className="logo-icon">
                  E
                </div>

                <div>
                  <h2>EventHub</h2>
                  <p>College Events</p>
                </div>

              </div>

              <nav className="sidebar-nav">
  <p className="menu-title">
  {isAdmin ? "ADMIN" : isStudent ? "STUDENT" : "MAIN MENU"}
</p>

  {isAdmin ? (
    <>
      <NavLink
        to="/admin"
        end
        className="nav-item"
      >
        <LayoutDashboard size={19} />
        <span>Dashboard</span>
      </NavLink>

      <NavLink
        to="/admin/users"
        className="nav-item"
      >
        <Users size={19} />
        <span>Users</span>
      </NavLink>

      <NavLink
        to="/admin/events"
        className="nav-item"
      >
        <CalendarDays size={19} />
        <span>Events</span>
      </NavLink>

      <NavLink
        to="/admin/venues"
        className="nav-item"
      >
        <MapPin size={19} />
        <span>Venues</span>
      </NavLink>

      <NavLink
        to="/admin/feedback"
        className="nav-item"
      >
        <Users size={19} />
        <span>Feedback</span>
      </NavLink>

      <p className="menu-title management-title">
        ANALYTICS
      </p>

      <NavLink
        to="/admin/reports"
        className="nav-item"
      >
        <BarChart3 size={19} />
        <span>Reports</span>
      </NavLink>

      <p className="menu-title management-title">
        SYSTEM
      </p>

      <NavLink to="/admin/settings" className="sidebar-link">
  <Settings size={18} />
  <span>Settings</span>
</NavLink>
    </>
  ) : isStudent ? (
    <>
      <NavLink
    to="/student"
    end
    className="nav-item"
  >
    <LayoutDashboard size={19} />
    <span>Dashboard</span>
  </NavLink>

  <NavLink
    to="/student/events"
    className="nav-item"
  >
    <CalendarDays size={19} />
    <span>Browse Events</span>
  </NavLink>

  <NavLink
    to="/student/my-events"
    className="nav-item"
  >
    <ClipboardList size={19} />
    <span>My Events</span>
  </NavLink>

  <NavLink
    to="/student/event-history"
    className="nav-item"
  >
    <CalendarDays size={19} />
    <span>Event History</span>
  </NavLink>

  <NavLink
    to="/student/recommendations"
    className="nav-item"
  >
    <CalendarDays size={19} />
    <span>Recommendations</span>
  </NavLink>

  <NavLink
    to="/student/feedback"
    className="nav-item"
  >
    <Users size={19} />
    <span>My Feedback</span>
  </NavLink>

  <NavLink
    to="/student/notifications"
    className="nav-item"
  >
    <Bell size={19} />
    <span>Notifications</span>
  </NavLink>

  <p className="menu-title management-title">
    MY ACTIVITY
  </p>

  <NavLink
    to="/student/reports"
    className="nav-item"
  >
    <BarChart3 size={19} />
    <span>Reports</span>
  </NavLink>

  <p className="menu-title management-title">
    ACCOUNT
  </p>

  

  <NavLink
  to="/student/settings"
  className="nav-item"
>
  <Settings size={19} />
  <span>Settings</span>
</NavLink>
</>

    ) : (
    <>
      <NavLink
        to="/"
        end
        className="nav-item"
      >
        <LayoutDashboard size={19} />
        <span>Dashboard</span>
      </NavLink>

      <NavLink
        to="/events"
        className="nav-item"
      >
        <CalendarDays size={19} />
        <span>Events</span>
      </NavLink>

      <NavLink
        to="/participants"
        className="nav-item"
      >
        <Users size={19} />
        <span>Participants</span>
      </NavLink>

      <NavLink
        to="/venues"
        className="nav-item"
      >
        <MapPin size={19} />
        <span>Venues</span>
      </NavLink>

      <p className="menu-title management-title">
        MANAGEMENT
      </p>

      <NavLink
        to="/reports"
        className="nav-item"
      >
        <BarChart3 size={19} />
        <span>Reports</span>
      </NavLink>

      <NavLink
        to="/settings"
        className="nav-item"
      >
        <Settings size={19} />
        <span>Settings</span>
      </NavLink>
    </>
  )}
</nav>

              <div className="sidebar-bottom">
                <div className="sidebar-user-row">
                  <div className="profile-mini">
                    <div className="avatar">
                      {getUserAvatarInitial(currentUser, isAdmin ? "Admin" : isStudent ? "Student" : "Organizer")}
                    </div>
                    <div className="profile-info">
                      <strong>
                        {getUserDisplayName(currentUser, isAdmin ? "Admin" : isStudent ? "Student" : "Organizer")}
                      </strong>
                      <span>
                        {isAdmin ? "Administrator" : isStudent ? "Participant" : "Organizer"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sidebar-signout-btn"
                    onClick={() => setShowLogoutConfirm(true)}
                    title="Sign Out"
                    aria-label="Sign Out"
                  >
                    <LogOut size={17} />
                  </button>
                </div>
              </div>

            </aside>

            {/* =========================
                MAIN CONTENT
            ========================== */}

            <main className="main-content">

              {/* =========================
                  TOPBAR
              ========================== */}

              <header className="topbar">

                <div className="search-box">

                  <Search size={18} />

                  <input
                    type="text"
                    placeholder="Search events..."
                  />

                </div>

                <div className="topbar-actions">

                  {/* =========================
                      NOTIFICATIONS
                  ========================== */}

                  <div className="notification-wrapper">

                    <button
                      className="icon-button notification-button"
                      type="button"
                      aria-label="Notifications"
                      onClick={() =>
                        setShowNotifications(
                          (old) => !old
                        )
                      }
                    >

                      <Bell size={20} />

                      {unreadCount > 0 && (
                        <span className="notification-dot">
                          {unreadCount}
                        </span>
                      )}

                    </button>

                    {showNotifications && (

                      <div className="notification-dropdown">

                        <div className="notification-header">

                          <div>

                            <h3>
                              Notifications
                            </h3>

                            <span>
                              {unreadCount > 0
                                ? `${unreadCount} unread`
                                : "All caught up"}
                            </span>

                          </div>

                          <button
                            type="button"
                            className="notification-close"
                            onClick={() =>
                              setShowNotifications(
                                false
                              )
                            }
                            aria-label="Close notifications"
                          >
                            <X size={17} />
                          </button>

                        </div>

                        <div className="notification-list">

                          {notifications.length === 0 ? (

                            <div className="no-notifications">

                              <Bell size={24} />

                              <p>
                                No notifications
                              </p>

                            </div>

                          ) : (

                            notifications.map(
                              (notification) => (

                                <div
                                  key={
                                    notification.id
                                  }
                                  className={`notification-item ${
                                    !notification.is_read
                                      ? "unread"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    markAsRead(
                                      notification.id
                                    )
                                  }
                                >

                                  <div className="notification-icon">

                                    <Bell size={16} />

                                  </div>

                                  <div className="notification-content">

                                    <strong>
                                      {
                                        notification.title
                                      }
                                    </strong>

                                    <p>
                                      {
                                        notification.message
                                      }
                                    </p>

                                    <span>
                                      {new Date(notification.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                                    </span>

                                  </div>

                                  {!notification.is_read && (
                                    <span className="unread-indicator" />
                                  )}

                                </div>

                              )
                            )

                          )}

                        </div>

                        {notifications.length > 0 && (

                          <div className="notification-footer">

                            <button
                              type="button"
                              onClick={
                                markAllAsRead
                              }
                            >
                              <Check size={15} />
                              Mark all as read
                            </button>

                          </div>

                        )}

                      </div>

                    )}

                  </div>

                  {/* Profile */}

                  <div className="topbar-profile">
                    <div className="avatar">
                      {getUserAvatarInitial(currentUser, isAdmin ? "Admin" : isStudent ? "Student" : "Organizer")}
                    </div>
                    <div>
                      <strong>
                        {getUserDisplayName(currentUser, isAdmin ? "Admin" : isStudent ? "Student" : "Organizer")}
                      </strong>
                      <span>
                        {isAdmin ? "Administrator" : isStudent ? "Participant" : "Organizer"}
                      </span>
                    </div>
                  </div>

                </div>

              </header>

              {/* =========================
                  APPLICATION ROUTES
              ========================== */}

              <Routes>

                <Route
                  path="/"
                  element={
                  <ProtectedRoute>
                  <Dashboard />
                  </ProtectedRoute>
                  }
                />

                <Route
                  path="/events"
                  element={<Events />}
                />

                <Route
                  path="/participants"
                  element={<Participants />}
                />

                <Route
                  path="/venues"
                  element={
                    <ProtectedRoute>
                      <AdminVenues />
                    </ProtectedRoute>
                  }
                />


                <Route
                  path="/reports"
                  element={<Reports />}
                />

                <Route
                  path="/settings"
                  element={<SettingsPage />}
                />

                {/* Temporary placeholders for future roles */}

                <Route
  path="/admin"
  element={
    <ProtectedRoute>
      <AdminDashboard />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/users"
  element={
    <ProtectedRoute>
      <AdminUsers />
    </ProtectedRoute>
  }
/>
<Route
  path="/admin/events"
  element={
    <ProtectedRoute>
      <AdminEvents />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/venues"
  element={
    <ProtectedRoute>
      <AdminVenues />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/registrations"
  element={
    <ProtectedRoute>
      <AdminRegistrations />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/feedback"
  element={
    <ProtectedRoute>
      <AdminFeedback />
    </ProtectedRoute>
  }
/>

<Route
  path="/admin/reports"
  element={
    <ProtectedRoute>
      <AdminReports />
    </ProtectedRoute>
  }
/>
<Route
  path="/admin/settings"
  element={
    <ProtectedRoute>
      <SettingsPage />
    </ProtectedRoute>
  }
/>
                <Route
  path="/student"
  element={
    <ProtectedRoute>
      <StudentDashboard />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/events"
  element={
    <ProtectedRoute>
      <StudentEvents />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/my-events"
  element={
    <ProtectedRoute>
      <StudentMyEvents />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/event-history"
  element={
    <ProtectedRoute>
      <StudentEventHistory />
    </ProtectedRoute>
  }
/>

<Route
  path="/student"
  element={
    <div style={{ padding: "30px" }}>
      Student dashboard coming next.
    </div>
  }
/>

<Route
  path="/student/recommendations"
  element={
    <ProtectedRoute>
      <StudentRecommendations />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/feedback"
  element={
    <ProtectedRoute>
      <StudentFeedback />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/notifications"
  element={
    <ProtectedRoute>
      <StudentNotifications />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/reports"
  element={
    <ProtectedRoute>
      <StudentReports />
    </ProtectedRoute>
  }
/>
<Route
  path="/student/settings"
  element={
    <ProtectedRoute>
      <StudentSettings />
    </ProtectedRoute>
  }
/>

                <Route
                  path="/events/:eventId/check-in"
                  element={
                    <ProtectedRoute>
                      <OrganizerCheckIn />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/admin/events/:eventId/check-in"
                  element={
                    <ProtectedRoute>
                      <OrganizerCheckIn />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="*"
                  element={<Navigate to="/" replace />}
                />

              </Routes>

            </main>

            {/* ── Global Sign-Out Confirm Modal ── */}
            {showLogoutConfirm && (
              <div
                className="logout-confirm-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="global-logout-title"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowLogoutConfirm(false);
                }}
              >
                <div className="logout-confirm-card">
                  <div className="logout-confirm-icon">
                    <LogOut size={28} />
                  </div>
                  <h3 id="global-logout-title">Sign out?</h3>
                  <p>You'll be returned to the login screen.</p>
                  <div className="logout-confirm-actions">
                    <button
                      type="button"
                      className="logout-confirm-cancel"
                      onClick={() => setShowLogoutConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="logout-confirm-proceed"
                      onClick={logout}
                    >
                      <LogOut size={15} /> Yes, Sign Out
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        }
      />

    </Routes>
  );
}

export default App;