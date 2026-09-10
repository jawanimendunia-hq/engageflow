export default function AppLoading() {
  return (
    <div className="page-shell max-w-6xl animate-pulse" aria-label="Memuat">
      <div className="mb-8 h-9 w-52 rounded-xl bg-bg-elev" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="card h-24 bg-bg-elev/70" />
        ))}
      </div>
      <div className="card mt-6 space-y-4 p-6">
        <div className="h-4 w-2/3 rounded bg-bg-elev" />
        <div className="h-4 w-full rounded bg-bg-elev" />
        <div className="h-4 w-5/6 rounded bg-bg-elev" />
      </div>
    </div>
  );
}
