import { useMachine } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import { appMachine } from "./appMachine";
import type { archiveMachine } from "./archiveMachine";
import { ArchivePage } from "./ArchivePage";
import type { boardMachine } from "./boardMachine";
import { BoardPage } from "./BoardPage";
import "./styles.css";

export default function App() {
  const [snapshot, send] = useMachine(appMachine);
  const onBoard = snapshot.matches("board");
  const boardRef = snapshot.children.board as ActorRefFrom<typeof boardMachine> | undefined;
  const archiveRef = snapshot.children.archive as ActorRefFrom<typeof archiveMachine> | undefined;

  return (
    <div className="app">
      <nav className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="tab-board"
          aria-selected={onBoard}
          onClick={() => send({ type: "tab.board" })}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-archive"
          aria-selected={!onBoard}
          onClick={() => send({ type: "tab.archive" })}
        >
          Archive
        </button>
      </nav>
      {onBoard && boardRef && <BoardPage key={boardRef.id + boardRef.sessionId} actor={boardRef} />}
      {!onBoard && archiveRef && <ArchivePage key={archiveRef.sessionId} actor={archiveRef} />}
    </div>
  );
}
