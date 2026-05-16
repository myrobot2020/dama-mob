import { createFileRoute, useNavigate } from "@tanstack/react-router";
import DamaStandaloneRunner from "@/lib/damaStandalone";

function PlantWithHomeButton() {
  const navigate = useNavigate();
  
  return (
    <>
      <button
        onClick={() => navigate({ to: '/' })}
        style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          zIndex: 9999,
          padding: '8px 16px',
          background: '#3d3124',
          color: '#f2e8cf',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        ← Home
      </button>
      <DamaStandaloneRunner />
    </>
  );
}

export const Route = createFileRoute("/dev/pipeline2")({
  component: PlantWithHomeButton,
});
