import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StoreProvider, useStore } from "./store";
import BottomNav from "./components/BottomNav";
import Schedule from "./views/Schedule";
import CalendarView from "./views/CalendarView";
import SessionView from "./views/SessionView";
import MembersView from "./views/MembersView";
import SettingsView from "./views/SettingsView";

function Shell() {
  const { ui } = useStore();
  const showNav = ui.view === "schedule" || ui.view === "members";
  return (
    <>
      <div className="app">
        {ui.view === "schedule" && <Schedule />}
        {ui.view === "members" && <MembersView />}
        {ui.view === "settings" && <SettingsView />}
        {ui.view === "session" && <SessionView />}
        {ui.view === "calendar" && <CalendarView />}
      </div>
      {showNav && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
      <Analytics />
      <SpeedInsights />
    </StoreProvider>
  );
}
