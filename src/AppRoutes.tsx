import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { AppLayout } from './features/layout/AppLayout'
import { PlaceholderPage } from './features/layout/PlaceholderPage'

/** Every page. All except /login require a signed-in user. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<PlaceholderPage title="Today" />} />
        <Route path="projects" element={<PlaceholderPage title="Projects" />} />
        <Route path="projects/:id" element={<PlaceholderPage title="Project" />} />
        <Route path="findings/new" element={<PlaceholderPage title="Log finding" />} />
        <Route path="findings/:id" element={<PlaceholderPage title="Finding" />} />
        <Route path="findings/:id/edit" element={<PlaceholderPage title="Edit finding" />} />
        <Route path="tasks" element={<PlaceholderPage title="Tasks" />} />
        <Route path="tasks/new" element={<PlaceholderPage title="Assign task" />} />
        <Route path="tasks/:id/edit" element={<PlaceholderPage title="Edit task" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
