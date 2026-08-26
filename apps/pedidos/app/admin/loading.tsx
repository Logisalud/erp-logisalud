export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card h-20 animate-pulse bg-gray-100 p-4" />
      ))}
    </div>
  );
}
