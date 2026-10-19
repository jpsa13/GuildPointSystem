import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/Shared/ui/Layout/Layout'
import { AuthProvider } from '@/Features/Auth/contexts/AuthContext'
import { ProtectedRoute, ModeratorRoute } from '@/Features/Auth/ProtectedRoute'
import { AuthShell } from '@/Features/Auth/AuthShell'
import { LoginPage } from '@/Features/Auth/LoginPage'
import { RegisterPage } from '@/Features/Auth/RegisterPage'
import { DiscordCallbackPage } from '@/Features/Auth/DiscordCallbackPage'
import { DashboardPage } from '@/Features/Dashboard/Dashboard'
import { DonationPage } from '@/Features/Donation/Donation'
import { LogsPage } from '@/Features/Logs/Logs'
import { ObjectivesPage } from '@/Features/Objectives/Objectives'
import { EventsPage } from '@/Features/Events/Events'
import { ItemsPage } from '@/Features/Items/Items'
import { AuctionListPage } from '@/Features/Auction/AuctionList'
import { AuctionDetailPage } from '@/Features/Auction/AuctionDetail'
import { ApprovalsPage } from '@/Features/Admin/Approvals/Approvals'
import { ProfilePage } from '@/Features/Profile/Profile'
import { GuildLeagueRagPage } from '@/Features/GuildLeagueRag/GuildLeagueRagPage'
import { ServerInfoListPage } from '@/Features/ServerInfo/ServerInfoListPage'
import { ServerInfoTopicPage } from '@/Features/ServerInfo/ServerInfoTopicPage'
import { PartyPage } from '@/Features/Party/Party'
import './App.styles.scss'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AuthShell />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route path="/auth/callback" element={<DiscordCallbackPage />} />
          <Route path="/guild-league-rag" element={<GuildLeagueRagPage />} />
          <Route path="/server-info" element={<ServerInfoListPage />} />
          <Route path="/server-info/:slug" element={<ServerInfoTopicPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="donate" element={<DonationPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="objectives" element={<ObjectivesPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="party" element={<PartyPage />} />
              <Route path="auctions" element={<AuctionListPage />} />
              <Route path="auctions/:id" element={<AuctionDetailPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="profile/:id" element={<ProfilePage />} />
              <Route element={<ModeratorRoute />}>
                <Route path="admin/approvals" element={<ApprovalsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
