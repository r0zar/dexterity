import { vi } from 'vitest'

// Mock @stacks/connect
vi.mock('@stacks/connect', () => ({
  openContractCall: vi.fn(),
  openContractDeploy: vi.fn(),
})); 