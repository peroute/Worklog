import { vi } from 'vitest'

/**
 * Shared fakes for src/data/* (everything except auth, see mockAuth.ts). Use with:
 *   vi.mock('<path>/data/findings', () => import('<path>/test/mockData').then((m) => m.findingsModule))
 * Each test sets return values with vi.mocked(fn).mockResolvedValue(...).
 */
export const profilesModule = {
  getMyProfile: vi.fn(),
  listProfiles: vi.fn(),
}

export const projectsModule = {
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  getProjectDeleteCounts: vi.fn(),
  deleteProject: vi.fn(),
}

export const tasksModule = {
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskStatus: vi.fn(),
  deleteTask: vi.fn(),
}

export const findingsModule = {
  listFindings: vi.fn(),
  getFinding: vi.fn(),
  createFinding: vi.fn(),
  updateFinding: vi.fn(),
  setFindingStatus: vi.fn(),
  deleteFinding: vi.fn(),
}

export const imagesModule = {
  uploadFindingImages: vi.fn(),
  deleteFindingImage: vi.fn(),
  listImagePaths: vi.fn(),
  removeStoredFiles: vi.fn(),
  signImagePaths: vi.fn(),
}
