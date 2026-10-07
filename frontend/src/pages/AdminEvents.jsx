
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Search,
  CalendarDays,
  CheckCircle2,
  Clock,
  MoreVertical,
  Eye,
  X,
  XCircle,
  Plus,
  Pencil,
} from "lucide-react";

import { api, updateEventStatus } from "../api";

function AdminEvents() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openMenu, setOpenMenu] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const loadEvents = async (searchValue = "") => {
    setLoading(true);
    setError("");

    try {
      const query = searchValue
        ? `?search=${encodeURIComponent(searchValue)}`
        : "";

      const data = await api(`/admin/events/${query}`);

      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load events:", e);

      setError(
        e?.data?.detail ||
          e?.message ||
          "Unable to load events."
      );

      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleSearch = (e) => {
    const value = e.target.value;

    setSearch(value);
    loadEvents(value);
  };

  const formatDate = (dateString) => {
    if (!dateString) {
      return "—";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) {
      return "—";
    }

    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const [statusFilter, setStatusFilter] = useState("all");

  const counts = {
    all: events.length,
    draft: events.filter((e) => e.status === "draft").length,
    published: events.filter((e) => e.status === "published").length,
    completed: events.filter((e) => e.status === "completed").length,
    cancelled: events.filter((e) => e.status === "cancelled").length,
  };

  const filteredEvents = events.filter((e) => {
    if (statusFilter === "all") return true;
    return e.status === statusFilter;
  });

  const getStatusIcon = (status) => {
    if (status === "completed") {
      return <CheckCircle2 size={14} />;
    }
    if (status === "draft") {
      return <Clock size={14} />;
    }
    if (status === "published") {
      return <CheckCircle2 size={14} />;
    }
    if (status === "cancelled") {
      return <X size={14} />;
    }
    return <Clock size={14} />;
  };

  const getStatusClass = (status) => {
    if (status === "draft") return "warning";
    if (status === "published") return "success";
    if (status === "completed") return "completed";
    if (status === "cancelled") return "danger";
    return "";
  };

  const handleMenuClick = (eventId) => {
    setOpenMenu((current) =>
      current === eventId ? null : eventId
    );
  };

  const handleViewDetails = (event) => {
    setSelectedEvent(event);
    setOpenMenu(null);
  };

  const handleStatusChange = async (eventId, newStatus) => {
    setOpenMenu(null);
    try {
      await updateEventStatus(eventId, newStatus);
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId ? { ...ev, status: newStatus } : ev
        )
      );
    } catch (e) {
      alert(e?.data?.detail || "Failed to update status");
    }
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  return (
    <div
      className="admin-dashboard"
      onClick={() => setOpenMenu(null)}
    >
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1>Event Management</h1>

          <p className="page-description">
            Review pending event submissions, publish approved events, and monitor activity.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/events?action=create")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            backgroundColor: "#2563eb",
            color: "#ffffff",
            borderRadius: "8px",
            fontWeight: 600,
            fontSize: "14px",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
          }}
        >
          <Plus size={18} />
          Create Event
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        {[
          { key: "all", label: "All Events", count: counts.all },
          { key: "draft", label: "Pending Approval", count: counts.draft, highlight: counts.draft > 0 },
          { key: "published", label: "Published", count: counts.published },
          { key: "completed", label: "Completed", count: counts.completed },
          { key: "cancelled", label: "Cancelled", count: counts.cancelled },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: statusFilter === tab.key ? "1.5px solid #2563eb" : "1px solid #e2e8f0",
              backgroundColor: statusFilter === tab.key ? "#eff6ff" : "#ffffff",
              color: statusFilter === tab.key ? "#1d4ed8" : "#475569",
              fontWeight: statusFilter === tab.key ? 600 : 500,
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
                backgroundColor: tab.highlight && tab.key === "draft" ? "#fef3c7" : statusFilter === tab.key ? "#dbeafe" : "#f1f5f9",
                color: tab.highlight && tab.key === "draft" ? "#d97706" : statusFilter === tab.key ? "#1d4ed8" : "#64748b",
                fontWeight: 700,
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="admin-user-toolbar">
        <div className="admin-user-search">
          <Search size={18} />

          <input
            type="text"
            placeholder="Search events by title or category..."
            value={search}
            onChange={handleSearch}
          />
        </div>
      </div>

      <div className="admin-table-panel">
        <div className="admin-table-header">
          <div>
            <h2>
              {statusFilter === "draft"
                ? "Pending Approval Events"
                : statusFilter === "published"
                ? "Published Events"
                : statusFilter === "completed"
                ? "Completed Events"
                : statusFilter === "cancelled"
                ? "Cancelled Events"
                : "All Events"}
            </h2>

            <p>
              {statusFilter === "draft"
                ? "Events submitted by organizers waiting for admin review and publishing."
                : "View event details, registrations and event status."}
            </p>
          </div>
        </div>

        {error && (
          <div className="admin-error-message">
            {error}
          </div>
        )}

        <div className="admin-events-table">
          <div className="admin-events-heading">
            <span>Event</span>
            <span>Organizer</span>
            <span>Date</span>
            <span>Registrations</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {loading ? (
            <div className="admin-users-empty">
              Loading events...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="admin-users-empty">
              {statusFilter === "draft"
                ? "No pending events waiting for approval."
                : "No events found."}
            </div>
          ) : (
            filteredEvents.map((event) => (
              <div
                className="admin-events-row"
                key={event.id || event.title}
              >
                <div className="admin-event-info">
                  <div className="admin-event-icon">
                    <CalendarDays size={18} />
                  </div>

                  <div>
                    <strong>
                      {event.title}
                    </strong>

                    <span>
                      {event.category}
                    </span>
                  </div>
                </div>

                <span className="admin-role">
                  {event.organizer || "—"}
                </span>

                <span className="admin-event-date">
                  {formatDate(event.start_date)}
                </span>

                <span className="admin-registration-count">
                  {event.registrations ?? 0} /{" "}
                  {event.capacity ?? 0}
                </span>

                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor:
                      event.status === "draft"
                        ? "#fef3c7"
                        : event.status === "published"
                        ? "#dcfce7"
                        : event.status === "completed"
                        ? "#e0f2fe"
                        : "#f3f4f6",
                    color:
                      event.status === "draft"
                        ? "#d97706"
                        : event.status === "published"
                        ? "#16a34a"
                        : event.status === "completed"
                        ? "#0284c7"
                        : "#64748b",
                  }}
                >
                  {getStatusIcon(event.status)}
                  {event.status === "draft"
                    ? "Pending Approval"
                    : event.status === "published"
                    ? "Published"
                    : event.status === "completed"
                    ? "Completed"
                    : event.status === "cancelled"
                    ? "Cancelled"
                    : event.status || "Upcoming"}
                </span>

                <div
                  className="admin-user-actions"
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  {event.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(event.id, "published")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#16a34a",
                          color: "#ffffff",
                          border: "none",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        title="Approve and Publish this event"
                      >
                        <CheckCircle2 size={13} />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Reject "${event.title}"? This will cancel the event and notify the organizer.`)) {
                            handleStatusChange(event.id, "cancelled");
                          }
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          backgroundColor: "#dc2626",
                          color: "#ffffff",
                          border: "none",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        title="Reject this event submission"
                      >
                        <XCircle size={13} />
                        <span>Reject</span>
                      </button>
                    </>
                  )}

                  <div className="admin-user-menu-wrapper">
                    <button
                      type="button"
                      title="More options"
                      onClick={() =>
                        handleMenuClick(event.id)
                      }
                    >
                      <MoreVertical size={17} />
                    </button>

                    {openMenu === event.id && (
                      <div className="admin-user-dropdown">
                        <button
                          type="button"
                          onClick={() =>
                            handleViewDetails(event)
                          }
                        >
                          <Eye size={16} />
                          <span>View Details</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/events?edit=${event.id}`)
                          }
                        >
                          <Pencil size={16} />
                          <span>Edit Event</span>
                        </button>
                        {event.status !== "published" && event.status !== "completed" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusChange(event.id, "published")
                            }
                          >
                            <CheckCircle2 size={16} />
                            <span>Approve &amp; Publish</span>
                          </button>
                        )}
                        {event.status !== "completed" && event.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusChange(event.id, "completed")
                            }
                          >
                            <CheckCircle2 size={16} />
                            <span>Mark Completed</span>
                          </button>
                        )}
                        {event.status !== "cancelled" && event.status !== "completed" && (
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusChange(event.id, "cancelled")
                            }
                          >
                            <X size={16} />
                            <span>Cancel Event</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* EVENT DETAILS MODAL */}
      {selectedEvent && (
        <div
          className="admin-modal-overlay"
          onClick={closeModal}
        >
          <div
            className="admin-user-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <div className="admin-modal-header">
              <div>
                <h2>Event Details</h2>

                <p>
                  View complete event information.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="admin-modal-close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-user-details">
              <div className="admin-detail-avatar">
                <CalendarDays size={24} />
              </div>

              <div className="admin-detail-item">
                <label>Event</label>
                <strong>
                  {selectedEvent.title || "—"}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>Category</label>
                <strong>
                  {selectedEvent.category || "—"}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>Organizer</label>
                <strong>
                  {selectedEvent.organizer || "—"}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>Venue</label>
                <strong>
                  {selectedEvent.venue || "—"}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>Start</label>
                <strong>
                  {formatDateTime(
                    selectedEvent.start_date
                  )}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>End</label>
                <strong>
                  {formatDateTime(
                    selectedEvent.end_date
                  )}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>Registrations</label>
                <strong>
                  {selectedEvent.registrations ?? 0} /{" "}
                  {selectedEvent.capacity ?? 0}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>Status</label>
                <strong>
                  {selectedEvent.status ||
                    "Upcoming"}
                </strong>
              </div>

              <div className="admin-detail-item">
                <label>Description</label>
                <strong>
                  {selectedEvent.description ||
                    "No description available."}
                </strong>
              </div>
            </div>

            <div className="admin-modal-footer" style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              {selectedEvent.status === "draft" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleStatusChange(selectedEvent.id, "published");
                      closeModal();
                    }}
                    style={{ padding: "8px 16px", backgroundColor: "#16a34a", color: "#ffffff", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <CheckCircle2 size={16} /> Approve &amp; Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Reject "${selectedEvent.title}"? This will cancel the event.`)) {
                        handleStatusChange(selectedEvent.id, "cancelled");
                        closeModal();
                      }
                    }}
                    style={{ padding: "8px 16px", backgroundColor: "#dc2626", color: "#ffffff", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <XCircle size={16} /> Reject Submission
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  const eventId = selectedEvent.id;
                  closeModal();
                  navigate(`/events?edit=${eventId}`);
                }}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Pencil size={16} /> Edit Event
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="admin-modal-cancel"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminEvents;
