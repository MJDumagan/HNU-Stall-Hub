import Image from 'next/image';

export default function LoadingScreen({ title = 'Getting things ready', message = 'Preparing your StallHub experience...' }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-mark">
          <span className="loading-ring" />
          <Image src="/hnu-logo.png" alt="" width={54} height={64} priority />
        </div>
        <p className="loading-eyebrow">HOLY NAME UNIVERSITY</p>
        <h1>{title}</h1>
        <p className="loading-message">{message}</p>
        <div className="loading-progress" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
