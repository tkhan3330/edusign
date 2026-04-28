import React from "react";
import { FileText, CheckCircle2, Clock, FileType } from "lucide-react";

function SkeletonFile() {
  return (
    <div className="file-skeleton">
      <div className="sk-light sk-icon-lg" />
      <div style={{ flex: 1 }}>
        <div className="sk-light sk-text" style={{ width: "78%", marginBottom: 8 }} />
        <div className="sk-light sk-text" style={{ width: "48%" }} />
      </div>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtSigned(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

export function FileList({ files, selectedId, onSelect, loading, folderName }) {
  const signed   = files.filter((f) => f.isSigned).length;
  const unsigned = files.filter((f) => !f.isSigned).length;

  return (
    <section className="file-panel">
      <div className="file-panel-header">
        <div>
          <h2 className="panel-heading">
            {folderName ? folderName.split(" ").slice(0, 2).join(" ") : "Files"}
          </h2>
          {folderName && (
            <p className="panel-subheading">Lesson plan submissions</p>
          )}
          {files.length > 0 && (
            <div className="file-stats">
              <span className="badge badge-success">{signed} signed</span>
              <span className="badge badge-pending">{unsigned} pending</span>
            </div>
          )}
        </div>
      </div>

      <div className="file-list" role="list">
        {!folderName ? (
          <div className="panel-empty">
            <div className="panel-empty-icon">👈</div>
            <p>Choose a teacher folder to view their lesson plans</p>
          </div>
        ) : loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonFile key={i} />)
        ) : files.length === 0 ? (
          <div className="panel-empty">
            <div className="panel-empty-icon">📭</div>
            <p>No files in this folder yet</p>
          </div>
        ) : (
          files.map((file) => (
            <button
              key={file.id}
              className={`file-card${selectedId === file.id ? " active" : ""}${file.isSigned ? " is-signed" : ""}`}
              onClick={() => onSelect(file)}
              role="listitem"
              aria-pressed={selectedId === file.id}
            >
              <div className="file-card-icon">
                {file.isSigned
                  ? <CheckCircle2 size={20} color="#059669" />
                  : file.mimeType && file.mimeType !== "application/pdf"
                    ? <FileType size={20} color="#2563eb" />
                    : <FileText size={20} color="#6b7a99" />}
              </div>
              <div className="file-card-body">
                <span className="file-card-name" title={file.name}>{file.name}</span>
                <div className="file-card-meta">
                  {file.isSigned ? (
                    <span className="file-signed-info">
                      <Clock size={10} />
                      {fmtSigned(file.signedAt)} · {file.signedBy}
                    </span>
                  ) : (
                    <>
                      <span>{file.size}</span>
                      <span className="meta-dot">·</span>
                      <span>{fmtDate(file.modifiedTime)}</span>
                    </>
                  )}
                </div>
              </div>
              <span className={`status-chip ${file.isSigned ? "chip-signed" : "chip-pending"}`}>
                {file.isSigned ? "Signed" : "Pending"}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}