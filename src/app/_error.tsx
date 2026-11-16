// src/app/_error.tsx
import React from "react";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong</title>
      </head>
      <body className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="p-8 bg-white rounded shadow">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="mb-4">{error.message}</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

