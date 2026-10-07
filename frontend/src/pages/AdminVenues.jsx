import { useEffect, useState } from "react";
import {
  Search, MapPin, Users, CheckCircle2, XCircle,
  MoreVertical, Eye, Pencil, Trash2, Plus, X, AlertTriangle,
} from "lucide-react";
import { getVenues, createVenue, updateVenue, deleteVenue } from "../api";

const EMPTY_FORM = {
  name: "", location: "", capacity: "",
  description: "", amenities: "", is_available: true,
};

const inputStyle = {
  width: "100%", padding: "9px 13px", borderRadius: 8,
  border: "1px solid rgba(99,102,241,.3)", background: "rgba(15,23,42,.6)",
  color: "#f1f5f9", fontSize: 14, outline: "none", boxSizing: "border-box",
};

function AdminVenues() {
  const [venues, setVenues] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMenu, setOpenMenu] = useState(null);
  const [detailVenue, setDetailVenue] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [conflictAlert, setConflictAlert] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadVenues = async (searchValue = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await getVenues({ search: searchValue });
      setVenues(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.data?.detail || e?.message || "Unable to load venues.");
      setVenues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVenues(); }, []);

  const handleSearch = (e) => {
    const v = e.target.value;
    setSearch(v);
    loadVenues(v);
  };

  const formatAmenities = (a) =>
    Array.isArray(a) ? (a.length ? a.join(", ") : "None") : (a || "None");

  const closeAllModals = () => {
    setDetailVenue(null);
    setShowForm(false);
    setEditingVenue(null);
    setFormData(EMPTY_FORM);
    setFormError("");
    setDeleteTarget(null);
    setConflictAlert(null);
  };

  const openCreate = () => {
    setEditingVenue(null);
    setFormData(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
    setOpenMenu(null);
  };

  const openEdit = (venue) => {
    setEditingVenue(venue);
    setFormData({
      name: venue.name || "",
      location: venue.location || "",
      capacity: venue.capacity ?? "",
      description: venue.description || "",
      amenities: Array.isArray(venue.amenities)
        ? venue.amenities.join(", ")
        : venue.amenities || "",
      is_available: venue.is_available ?? true,
    });
    setFormError("");
    setShowForm(true);
    setOpenMenu(null);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      const payload = {
        ...formData,
        capacity: parseInt(formData.capacity, 10) || 0,
        amenities: formData.amenities
          ? formData.amenities.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      };
      if (editingVenue) {
        await updateVenue(editingVenue.id, payload);
      } else {
        await createVenue(payload);
      }
      closeAllModals();
      await loadVenues(search);
    } catch (e) {
      setFormError(e?.data?.detail || e?.message || "Failed to save venue.");
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDelete = (venue) => {
    setDeleteTarget(venue);
    setOpenMenu(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteVenue(deleteTarget.id);
      setDeleteTarget(null);
      await loadVenues(search);
    } catch (e) {
      const ed = e?.data || {};
      if (ed.code === "venue_in_use" || e?.status === 400) {
        setConflictAlert({
          venueName: deleteTarget.name,
          message: ed.detail || e?.message || "Venue is in use.",
          conflictingEvents: ed.conflicting_events || [],
        });
        setDeleteTarget(null);
      } else {
        setDeleteTarget(null);
        setError(e?.data?.detail || e?.message || "Failed to delete venue.");
      }
    }
  };

  const btnPrimary = {
    padding: "10px 22px", borderRadius: 8,
    background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
    color: "#fff", border: "none", fontWeight: 600, cursor: "pointer",
  };
  const btnDanger = {
    ...btnPrimary,
    background: "linear-gradient(135deg,#ef4444,#dc2626)",
  };

  return (
    <div className="admin-dashboard" onClick={() => setOpenMenu(null)}>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Venue Management</h1>
          <p className="page-description">Add, edit, and remove college venues for events.</p>
        </div>
        <button
          id="add-venue-btn"
          type="button"
          onClick={openCreate}
          style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 7, boxShadow: "0 4px 15px rgba(99,102,241,.35)" }}
        >
          <Plus size={17} /> Add Venue
        </button>
      </div>

      {/* Search */}
      <div className="admin-user-toolbar">
        <div className="admin-user-search">
          <Search size={18} />
          <input
            id="venue-search"
            type="text"
            placeholder="Search venues..."
            value={search}
            onChange={handleSearch}
          />
        </div>
      </div>

      {error && <div className="admin-error-message">{error}</div>}

      {/* Table */}
      <div className="admin-table-panel">
        <div className="admin-table-header">
          <div>
            <h2>All Venues</h2>
            <p>View and manage all college venues.</p>
          </div>
          <span style={{
            background: "rgba(99,102,241,.13)", color: "#818cf8",
            borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 600,
          }}>
            {venues.length} venue{venues.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="admin-venues-table">
          <div className="admin-venues-heading">
            <span>Venue</span>
            <span>Capacity</span>
            <span>Amenities</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {loading ? (
            <div className="admin-users-empty">Loading venues...</div>
          ) : venues.length === 0 ? (
            <div className="admin-users-empty">No venues found.</div>
          ) : (
            venues.map((venue) => (
              <div className="admin-venues-row" key={venue.id || venue.name}>
                <div className="admin-venue-info">
                  <div className="admin-venue-icon"><MapPin size={18} /></div>
                  <div>
                    <strong>{venue.name || "Unnamed Venue"}</strong>
                    <span>{venue.location || "No location"}</span>
                  </div>
                </div>

                <div className="admin-venue-capacity">
                  <Users size={15} />
                  <span>{venue.capacity ?? 0}</span>
                </div>

                <span className="admin-venue-amenities">
                  {formatAmenities(venue.amenities)}
                </span>

                <span className={`admin-venue-status ${venue.is_available ? "available" : "booked"}`}>
                  {venue.is_available ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {venue.is_available ? "Available" : "Booked"}
                </span>

                <div className="admin-user-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="admin-user-menu-wrapper">
                    <button
                      type="button"
                      title="More options"
                      onClick={() => setOpenMenu((c) => c === venue.id ? null : venue.id)}
                    >
                      <MoreVertical size={17} />
                    </button>
                    {openMenu === venue.id && (
                      <div className="admin-user-dropdown">
                        <button type="button" onClick={() => { setDetailVenue(venue); setOpenMenu(null); }}>
                          <Eye size={16} /><span>View Details</span>
                        </button>
                        <button type="button" onClick={() => openEdit(venue)}>
                          <Pencil size={16} /><span>Edit</span>
                        </button>
                        <button type="button" style={{ color: "#f87171" }} onClick={() => confirmDelete(venue)}>
                          <Trash2 size={16} /><span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {detailVenue && (
        <div className="admin-modal-overlay" onClick={() => setDetailVenue(null)}>
          <div className="admin-user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div><h2>Venue Details</h2><p>Complete venue information.</p></div>
              <button type="button" className="admin-modal-close" onClick={() => setDetailVenue(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="admin-user-details">
              <div className="admin-detail-avatar"><MapPin size={24} /></div>
              {[
                ["Venue", detailVenue.name || "Unnamed Venue"],
                ["Location", detailVenue.location || "No location"],
                ["Capacity", detailVenue.capacity ?? 0],
                ["Status", detailVenue.is_available ? "Available" : "Booked"],
                ["Amenities", formatAmenities(detailVenue.amenities)],
                ["Description", detailVenue.description || "No description available."],
              ].map(([lbl, val]) => (
                <div className="admin-detail-item" key={lbl}>
                  <label>{lbl}</label>
                  <strong className={lbl === "Status" ? (detailVenue.is_available ? "admin-detail-active" : "admin-detail-inactive") : undefined}>
                    {val}
                  </strong>
                </div>
              ))}
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => { setDetailVenue(null); openEdit(detailVenue); }}
              >
                <Pencil size={15} /> Edit Venue
              </button>
              <button type="button" className="admin-modal-cancel" onClick={() => setDetailVenue(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {showForm && (
        <div className="admin-modal-overlay" onClick={closeAllModals}>
          <div className="admin-user-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h2>{editingVenue ? "Edit Venue" : "Add New Venue"}</h2>
                <p>{editingVenue ? "Update venue information." : "Create a new venue for college events."}</p>
              </div>
              <button type="button" className="admin-modal-close" onClick={closeAllModals}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="admin-user-details" style={{ gap: 14 }}>
                {formError && (
                  <div className="admin-error-message" style={{ marginBottom: 0 }}>{formError}</div>
                )}
                <div className="admin-detail-item">
                  <label htmlFor="av-name">Venue Name *</label>
                  <input id="av-name" name="name" type="text" placeholder="e.g. Main Auditorium"
                    value={formData.name} onChange={handleFormChange} required style={inputStyle} />
                </div>
                <div className="admin-detail-item">
                  <label htmlFor="av-location">Location</label>
                  <input id="av-location" name="location" type="text" placeholder="e.g. Block A, Ground Floor"
                    value={formData.location} onChange={handleFormChange} style={inputStyle} />
                </div>
                <div className="admin-detail-item">
                  <label htmlFor="av-capacity">Capacity</label>
                  <input id="av-capacity" name="capacity" type="number" min="0" placeholder="e.g. 500"
                    value={formData.capacity} onChange={handleFormChange} style={inputStyle} />
                </div>
                <div className="admin-detail-item">
                  <label htmlFor="av-amenities">
                    Amenities <span style={{ fontWeight: 400, opacity: 0.6 }}>(comma-separated)</span>
                  </label>
                  <input id="av-amenities" name="amenities" type="text"
                    placeholder="e.g. Projector, AC, Microphone"
                    value={formData.amenities} onChange={handleFormChange} style={inputStyle} />
                </div>
                <div className="admin-detail-item">
                  <label htmlFor="av-desc">Description</label>
                  <textarea id="av-desc" name="description" rows={3}
                    placeholder="Brief description of the venue..."
                    value={formData.description} onChange={handleFormChange}
                    style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div className="admin-detail-item" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <label htmlFor="av-avail" style={{ margin: 0 }}>Available for Booking</label>
                  <input id="av-avail" name="is_available" type="checkbox"
                    checked={formData.is_available} onChange={handleFormChange}
                    style={{ width: 18, height: 18, cursor: "pointer" }} />
                </div>
              </div>
              <div className="admin-modal-footer">
                <button
                  type="submit"
                  disabled={formLoading}
                  style={{ ...btnPrimary, opacity: formLoading ? 0.7 : 1, cursor: formLoading ? "not-allowed" : "pointer" }}
                >
                  {formLoading ? "Saving..." : editingVenue ? "Save Changes" : "Create Venue"}
                </button>
                <button type="button" className="admin-modal-cancel" onClick={closeAllModals}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="admin-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="admin-user-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div><h2>Delete Venue</h2><p>This will archive the venue.</p></div>
              <button type="button" className="admin-modal-close" onClick={() => setDeleteTarget(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: "12px 24px 4px" }}>
              <p style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
                Are you sure you want to archive{" "}
                <strong style={{ color: "#f1f5f9" }}>"{deleteTarget.name}"</strong>?
                It will be removed from active listings.
              </p>
            </div>
            <div className="admin-modal-footer">
              <button type="button" onClick={handleDelete}
                style={{ ...btnDanger, display: "flex", alignItems: "center", gap: 6 }}>
                <Trash2 size={15} /> Yes, Delete
              </button>
              <button type="button" className="admin-modal-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Alert Modal */}
      {conflictAlert && (
        <div className="admin-modal-overlay" onClick={() => setConflictAlert(null)}>
          <div className="admin-user-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header" style={{ borderBottomColor: "#f59e0b33" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={22} style={{ color: "#f59e0b", flexShrink: 0 }} />
                <div>
                  <h2 style={{ color: "#fbbf24" }}>Cannot Delete Venue</h2>
                  <p>This venue is assigned to active events.</p>
                </div>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setConflictAlert(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: "16px 24px", color: "#cbd5e1", lineHeight: 1.7 }}>
              <p style={{ marginBottom: 14 }}>
                <strong style={{ color: "#f1f5f9" }}>"{conflictAlert.venueName}"</strong>{" "}
                cannot be archived because it is assigned to the following upcoming or ongoing event(s):
              </p>
              {conflictAlert.conflictingEvents.length > 0 && (
                <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {conflictAlert.conflictingEvents.map((ev) => (
                    <li key={ev.id} style={{
                      background: "rgba(245,158,11,.08)",
                      border: "1px solid rgba(245,158,11,.22)",
                      borderRadius: 8, padding: "8px 14px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{ev.title}</span>
                      <span style={{
                        background: ev.status === "ongoing" ? "rgba(34,197,94,.15)" : "rgba(99,102,241,.15)",
                        color: ev.status === "ongoing" ? "#4ade80" : "#818cf8",
                        borderRadius: 20, padding: "2px 10px", fontSize: 12,
                        fontWeight: 600, textTransform: "capitalize",
                      }}>
                        {ev.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p style={{ marginTop: 14, fontSize: 13, opacity: 0.8 }}>
                Please change the venue for those events first, or wait for ongoing events to complete.
              </p>
            </div>
            <div className="admin-modal-footer">
              <button type="button" onClick={() => setConflictAlert(null)} style={btnPrimary}>
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminVenues;
