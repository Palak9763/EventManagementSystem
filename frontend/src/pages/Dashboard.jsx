import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ClipboardList, Users, MapPin, BarChart3, Plus } from "lucide-react";
import { getDashboard } from "../api";
import { errorMessage, formatDate, formatTime } from "../utils";

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(errorMessage(e)));
  }, []);

  const stats = data?.statistics || {};
  const categories = Object.entries(data?.category_counts || {});
  const totalCategoryEvents = categories.reduce((sum, [, count]) => sum + count, 0);
  const upcoming = data?.upcoming_events || [];

  return (
    <section className="dashboard-content">
      <div className="page-heading">
        <div>
          <p className="welcome-text">Welcome back! 👋</p>
          <h1>Dashboard Overview</h1>
          <p className="page-description">Manage your college events and registrations.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => navigate("/events?action=create")}>
          <Plus size={17} /> Create Event
        </button>
      </div>

      {error && <p className="page-description">Unable to load dashboard: {error}</p>}

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-card-top"><div className="stat-icon blue"><CalendarDays size={22} /></div><span className="stat-change">Live</span></div><h3>{stats.total_events ?? 0}</h3><p>Total Events</p></div>
        <div className="stat-card"><div className="stat-card-top"><div className="stat-icon green"><ClipboardList size={22} /></div><span className="stat-change">Live</span></div><h3>{String(stats.total_registrations ?? stats.my_registrations ?? 0).padStart(2, "0")}</h3><p>Total Registrations</p></div>
        <div className="stat-card"><div className="stat-card-top"><div className="stat-icon purple"><Users size={22} /></div><span className="stat-change">Live</span></div><h3>{stats.total_participants ?? stats.total_users ?? 0}</h3><p>Total Participants</p></div>
        <div className="stat-card"><div className="stat-card-top"><div className="stat-icon orange"><MapPin size={22} /></div><span className="stat-change">Available</span></div><h3>{stats.active_venues ?? 0}</h3><p>Active Venues</p></div>
      </div>

      <div className="content-grid">
        <div className="dashboard-card">
          <div className="card-heading"><div><h2>Upcoming Events</h2><p>Events happening soon</p></div><button className="text-button" type="button" onClick={() => navigate("/events")}>View All</button></div>
          <div className="event-list">
            {upcoming.length === 0 ? <p className="page-description">No upcoming events.</p> : upcoming.slice(0, 5).map((event) => {
              const date = new Date(event.start_date);
              const now = new Date();
              const endDate = event.end_date ? new Date(event.end_date) : (event.start_date ? new Date(event.start_date) : null);
              const isPast = endDate ? endDate < now : false;
              const isClosed = event.status === "completed" || isPast;
              const statusText = event.registration_status === "registered" ? "Registered" : event.registration_status === "waitlisted" ? "Waitlisted" : isClosed ? "Closed" : "Open";
              const statusClass = event.registration_status ? "" : isClosed ? "closed" : "open";

              return <div className="event-item" key={event.id}>
                <div className="event-date"><strong>{String(date.getDate()).padStart(2, "0")}</strong><span>{date.toLocaleString("en-IN", { month: "short" }).toUpperCase()}</span></div>
                <div className="event-info"><h3>{event.title}</h3><p>{event.venue?.name || "Venue TBA"} • {formatTime(event.start_date)}</p></div>
                <span className={`event-status ${statusClass}`}>{statusText}</span>
              </div>;
            })}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-heading"><div><h2>Event Categories</h2><p>Distribution of events</p></div></div>
          <div className="category-chart"><div className="donut-chart"><div className="donut-center"><strong>{totalCategoryEvents}</strong><span>Events</span></div></div></div>
          <div className="legend">
            {categories.length === 0 ? <span>No category data</span> : categories.slice(0, 5).map(([category, count], index) => <div key={category}><span className={`legend-dot ${["blue-bg", "green-bg", "purple-bg"][index % 3]}`}></span><span>{category}</span><strong>{totalCategoryEvents ? Math.round((count / totalCategoryEvents) * 100) : 0}%</strong></div>)}
          </div>
        </div>
      </div>

      <div className="dashboard-card quick-actions-card">
        <div className="card-heading"><div><h2>Quick Actions</h2><p>Access frequently used features</p></div></div>
        <div className="quick-actions">
          <button type="button" onClick={() => navigate("/events")}><CalendarDays size={22} /><span>Manage Events</span></button>
          <button type="button" onClick={() => navigate("/participants")}><Users size={22} /><span>View Participants</span></button>
          <button type="button" onClick={() => navigate("/venues")}><MapPin size={22} /><span>Manage Venues</span></button>
          <button type="button" onClick={() => navigate("/reports")}><BarChart3 size={22} /><span>View Reports</span></button>
        </div>
      </div>
    </section>
  );
}

export default Dashboard;
