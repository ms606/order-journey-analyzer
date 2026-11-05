import { useRef, useState, type DragEvent } from 'react';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; fileName: string; message: string; missing: string[] };

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"
      />
    </svg>
  );
}

export function PrivacyNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`privacy-note${compact ? ' privacy-note-compact' : ''}`}>
      <LockIcon />
      <span>
        <strong>This file stays on this computer.</strong>
        {compact ? null : (
          <> Nothing is uploaded or saved. Reloading or closing this page clears it.</>
        )}
      </span>
    </p>
  );
}

/** Drop zone with a file picker. Used for the order export and for the optional items file. */
export function FileDrop({
  onFile,
  title,
  hint,
  buttonLabel,
  inputLabel,
  disabled = false,
}: {
  onFile: (file: File) => void;
  title: string;
  hint: string;
  buttonLabel: string;
  inputLabel: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      className={`dropzone${over ? ' dropzone-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <p className="dropzone-title">{title}</p>
      <p className="dropzone-hint">{hint}</p>
      <button type="button" className="button button-primary" onClick={() => input.current?.click()} disabled={disabled}>
        {buttonLabel}
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        aria-label={inputLabel}
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

export function UploadScreen({ onFile, state, onReset }: { onFile: (file: File) => void; state: LoadState; onReset: () => void }) {
  return (
    <div className="upload-screen">
      <div className="upload-intro">
        <h2>Open a WooCommerce order export</h2>
        <p>
          Review how customers arrive and buy, then agree the rules for loading this data into the reporting database. Charts
          update as you change the rules.
        </p>
      </div>
      <PrivacyNote />
      {state.status === 'loading' ? (
        <div className="loading" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          Reading {state.fileName}…
        </div>
      ) : (
        <FileDrop
          onFile={onFile}
          title="Drag the CSV file here"
          hint="or choose it from this computer"
          buttonLabel="Choose CSV file"
          inputLabel="Order export CSV file"
        />
      )}
      {state.status === 'error' ? (
        <div className="alert alert-error" role="alert">
          <p className="alert-title">
            {state.fileName}: {state.message}
          </p>
          {state.missing.length > 0 ? (
            <>
              <p>These columns need to be in the file, spelled exactly like this:</p>
              <ul className="missing-list">
                {state.missing.map((m) => (
                  <li key={m}>
                    <code>{m}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button type="button" className="button" onClick={onReset}>
            Try another file
          </button>
        </div>
      ) : null}
    </div>
  );
}
