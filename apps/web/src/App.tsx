import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export default function App() {
  const [serverStatus, setServerStatus] = useState<"checking" | "ok" | "down">(
    "checking"
  );

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setServerStatus(data.status === "ok" ? "ok" : "down"))
      .catch(() => setServerStatus("down"));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-50 text-gray-900">
      <h1 className="text-4xl font-bold tracking-tight">CollabDocs</h1>
      <p className="text-gray-500">Real-time collaborative document editor</p>

      <div className="flex items-center gap-2 text-sm">
        <span
          className={
            "inline-block h-2.5 w-2.5 rounded-full " +
            (serverStatus === "ok"
              ? "bg-green-500"
              : serverStatus === "down"
                ? "bg-red-500"
                : "bg-yellow-400")
          }
        />
        <span className="text-gray-600">
          {serverStatus === "checking" && "Checking server…"}
          {serverStatus === "ok" && "Backend connected"}
          {serverStatus === "down" && "Backend not reachable"}
        </span>
      </div>
    </div>
  );
}
