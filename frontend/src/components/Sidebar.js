import React, { useState } from "react";
import { Search, FolderOpen, RefreshCw, CheckCircle } from "lucide-react";

function SkeletonFolder() {
  return (
    <div className="folder-skeleton">
      <div className="sk-dark sk-icon" />
      <div style={{ flex: 1 }}>
        <div className="sk-dark sk-text" style={{ width: "70%", marginBottom: 7 }} />
        <div className="sk-dark sk-text" style={{ width: "42%" }} />
      </div>
    </div>
  );
}

export function Sidebar({ folders, selectedId, onSelect, loading, onRefresh }) {
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );

  // Group by sourceLabel
  const grouped = filtered.reduce((acc, folder) => {
    const group = folder.sourceLabel || "Folders";
    if (!acc[group]) acc[group] = [];
    acc[group].push(folder);
    return acc;
  }, {});

  const toggleGroup = (group) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title-col">
          <div className="sidebar-title-row">
            <FolderOpen size={13} className="sidebar-title-icon" />
            <span className="sidebar-title">Teacher Folders</span>
          </div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,.42)", marginTop: "4px", marginLeft: "19px" }}>
            {folders.length} teacher{folders.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={onRefresh}
          title="Refresh"
          aria-label="Refresh folders"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="sidebar-search">
        <Search size={13} className="search-icon" />
        <input
          className="search-input"
          type="search"
          placeholder="Search teachers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search teacher folders"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
      </div>

      <nav className="folder-list" aria-label="Teacher folders">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonFolder key={i} />)
        ) : filtered.length === 0 ? (
          <div className="sidebar-empty">
            {query ? `No match for "${query}"` : "No folders found"}
          </div>
        ) : (
          Object.entries(grouped).map(([group, groupFolders]) => (
            <div key={group} className="folder-group">
              {Object.keys(grouped).length > 1 && (
                <button 
                  className="folder-group-header" 
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!collapsedGroups[group]}
                >
                  <span className="folder-group-title">{group}</span>
                  <span className="folder-group-count">{groupFolders.length}</span>
                </button>
              )}
              
              {!collapsedGroups[group] && (
                <div className="folder-group-items">
                  {groupFolders.map((folder) => {
                    const pct = folder.totalFiles
                      ? Math.round((folder.signedFiles / folder.totalFiles) * 100)
                      : 0;
                    const allDone = folder.totalFiles > 0 && folder.signedFiles === folder.totalFiles;

                    return (
                      <button
                        key={folder.id}
                        className={`folder-item${selectedId === folder.id ? " active" : ""}`}
                        onClick={() => onSelect(folder)}
                        aria-pressed={selectedId === folder.id}
                      >
                        <div className="folder-item-top">
                          <span className="folder-icon">{allDone ? "✅" : "📁"}</span>
                          <div className="folder-meta">
                            <span className="folder-name">{folder.name}</span>
                            <span className="folder-count">
                              {folder.signedFiles}/{folder.totalFiles} signed
                            </span>
                          </div>
                          {allDone && folder.totalFiles > 0 && (
                            <CheckCircle size={13} className="all-signed-icon" />
                          )}
                        </div>
                        {folder.totalFiles > 0 && (
                          <div className="folder-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                            <div className="folder-progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </nav>

    </aside>
  );
}