import { useActorRef, useSelector } from "@xstate/react";
import { BoardPage } from "./BoardPage";
import { ArchivePage } from "./ArchivePage";
import { tabsMachine } from "./tabsMachine";
import "./styles.css";

export default function App() {
  const tabs = useActorRef(tabsMachine);
  const tab = useSelector(tabs, (s) => s.value);

  return (
    <div className="app">
      <header className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          data-testid="tab-board"
          aria-selected={tab === "board"}
          onClick={() => tabs.send({ type: "SHOW_BOARD" })}
        >
          Board
        </button>
        <button
          type="button"
          role="tab"
          data-testid="tab-archive"
          aria-selected={tab === "archive"}
          onClick={() => tabs.send({ type: "SHOW_ARCHIVE" })}
        >
          Archive
        </button>
      </header>
      <main>{tab === "archive" ? <ArchivePage /> : <BoardPage />}</main>
    </div>
  );
}
