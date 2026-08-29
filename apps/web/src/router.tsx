import { createHashRouter } from 'react-router-dom'
import { Shell } from './shell'
import { HomePage } from './pages/home-page'
import { AgentsPage } from './pages/agents/agents-page'
import { AgentCreatePage } from './pages/agents/agent-create-page'
import { AgentDetailPage } from './pages/agents/agent-detail-page'
import { CompanyDetailPage, DepartmentDetailPage, OrganizationPage } from './pages/organization/organization-pages'
import { WorkspaceDetailPage, WorkspacesPage, WorkspaceWizardPage } from './pages/workspaces/workspace-pages'
import { AssetDetailPage, AssetsPage } from './pages/assets/asset-pages'
import { SkillsPage } from './pages/assets/skills-page'
import { BackupRestorePage, ClaudeCodeIntegrationPage, SettingsPage } from './pages/settings/settings-pages'
import { NotFoundPage } from './pages/not-found-page'
import { RouteErrorPage } from './pages/route-error-page'

export const router = createHashRouter([{
  path: '/',
  element: <Shell />,
  errorElement: <RouteErrorPage />,
  children: [
    { index: true, element: <HomePage /> },
    { path: 'agents', element: <AgentsPage /> },
    { path: 'agents/new', element: <AgentCreatePage /> },
    { path: 'agents/:id', element: <AgentDetailPage /> },
    { path: 'organization', element: <OrganizationPage /> },
    { path: 'organization/companies/:id', element: <CompanyDetailPage /> },
    { path: 'organization/departments/:id', element: <DepartmentDetailPage /> },
    { path: 'workspaces', element: <WorkspacesPage /> },
    { path: 'workspaces/new', element: <WorkspaceWizardPage /> },
    { path: 'workspaces/:id', element: <WorkspaceDetailPage /> },
    { path: 'assets', element: <AssetsPage /> },
    { path: 'assets/skills', element: <SkillsPage /> },
    { path: 'assets/:id', element: <AssetDetailPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: 'settings/claude-code', element: <ClaudeCodeIntegrationPage /> },
    { path: 'settings/backup', element: <BackupRestorePage /> },
    { path: '*', element: <NotFoundPage /> },
  ],
}])
