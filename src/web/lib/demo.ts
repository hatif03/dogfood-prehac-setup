export type DemoRole = "organizer" | "admin" | "judge" | "participant";

export type DemoAccount = {
  label: string;
  email: string;
  role: DemoRole;
  blurb: string;
};

export const DEMO_PASSWORD = "password";

// Seeded by src/api/app/seed.py. Judges and the participant are real fixture people.
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { label: "Organizer", email: "organizer@portal.local", role: "organizer", blurb: "Runs both events. Sees progress, normalization and the audit log." },
  { label: "Judge A", email: "diego.herrera@example.org", role: "judge", blurb: "Fixture judge jdg_24: 11 reviews across two tracks." },
  { label: "Judge B", email: "iva.petrova@example.org", role: "judge", blurb: "Fixture judge jdg_07: the constant rater. Also judges the Playground." },
  { label: "Participant", email: "priya1@example.org", role: "participant", blurb: "Captain of NorthKiln in the fixture. Can start a team in the Playground." },
  { label: "Admin", email: "admin@portal.local", role: "admin", blurb: "Platform admin across every event." },
];
