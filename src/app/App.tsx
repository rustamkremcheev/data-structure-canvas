import { ReactFlowProvider } from '@xyflow/react';
import { TopBar } from './TopBar';
import { RightPanel } from './RightPanel';
import { HelpDialog } from './HelpDialog';
import { Toolbar } from '../features/toolbar/Toolbar';
import { Canvas } from '../features/canvas/Canvas';
import { ContextMenu } from '../features/canvas/ContextMenu';
import { ExecutionController } from '../features/execution/ExecutionController';
import { Timeline } from '../features/timeline/Timeline';
import { ProjectsDialog } from '../features/projects/ProjectsDialog';
import { BranchDialog, ConfirmDialog, FormDialog, Toasts } from '../components/dialogs';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useAutosave, useRestoreLastProject } from '../hooks/useAutosave';

function Workspace() {
  useKeyboardShortcuts();
  useRestoreLastProject();
  useAutosave();
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <main className="relative min-w-0 flex-1">
          <Canvas />
          <ExecutionController />
        </main>
        <RightPanel />
      </div>
      <Timeline />
      <ContextMenu />
      <FormDialog />
      <ConfirmDialog />
      <BranchDialog />
      <ProjectsDialog />
      <HelpDialog />
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}
