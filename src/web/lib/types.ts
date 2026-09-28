// Response shapes of the Portal API (src/api). Kept in one place so every screen agrees.

export type Phase = "upcoming" | "submissions_open" | "judging" | "voting" | "results" | "archived";
export type Role = "visitor" | "participant" | "judge" | "organizer" | "admin";

export type Track = { id: string; slug: string; name: string; description?: string };
export type Prize = { id: string; name: string; description: string; track_id: string | null };
export type Criterion = { id: string; key: string; name: string; description: string; weight: number };
export type Rubric = { id: string; name: string; scale_min: number; scale_max: number; criteria: Criterion[] };
export type CustomQuestion = { id: string; prompt: string; required: boolean; sort_order: number };

export type EventSummary = {
  id: string;
  slug: string;
  external_id: string | null;
  name: string;
  tagline: string;
  phase: Phase;
  submissions_deadline: string | null;
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  results_published: boolean;
  archived: boolean;
  counts: { projects: number; judges: number; teams: number; tracks: number };
};

export type EventDetail = EventSummary & {
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  submissions_open_at: string | null;
  judging_deadline: string | null;
  judging_mode: "rubric" | "pairwise";
  voting_access: "open" | "authenticated" | "email_gated" | "link";
  vote_mode: "one_person_one_vote" | "quadratic";
  reviews_per_project: number;
  quadratic_budget: number;
  max_team_size: number;
  require_verified_email: boolean;
  submissions_open: boolean;
  voting_open: boolean;
  results_visible: boolean;
  tracks: Track[];
  prizes: Prize[];
  rubric: Rubric | null;
  questions: CustomQuestion[];
  viewer: { authenticated: boolean; role: Role; track_ids: string[]; team_id: string | null };
  widget_token?: string; // organizers only
};

export type Project = {
  id: string;
  external_id: string | null;
  title: string;
  summary: string;
  description: string;
  repo_url: string;
  live_link: string;
  demo_video_url: string;
  tech_tags: string[];
  track: { id: string; slug: string; name: string } | null;
  team: { id: string; name: string; members: string[] };
  submitted_at: string | null;
  comment_count: number;
  images: string[];
  status?: string;
  duplicate_of?: string | null;
};

export type Comment = { id: string; author: string; body: string; created_at: string; hidden: boolean };

export type Submission = {
  id: string;
  status: "draft" | "submitted" | "withdrawn";
  title: string;
  summary: string;
  description: string;
  demo_video_url: string;
  repo_url: string;
  live_link: string;
  tech_tags: string[];
  track_id: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  answers: { question_id: string; body: string }[];
  flags: { code: string; reason: string }[];
  images: string[];
  warnings?: string[];
};

export type Team = {
  id: string;
  name: string;
  invite_token: string | null;
  max_size: number;
  members: { user_id: string; display_name: string; email: string; is_captain: boolean }[];
  submission: Submission | null;
};

export type ScoreCell = { criterion_id: string; value: number };

export type QueueItem = {
  assignment_id: string;
  project: {
    id: string;
    title: string;
    summary: string;
    description: string;
    repo_url: string;
    live_link: string;
    demo_video_url: string;
    track: string | null;
    team: string;
  };
  score: { id: string; cells: ScoreCell[]; comment: string; submitted: boolean; weighted: number | null } | null;
};
export type Queue = { items: QueueItem[]; progress: { done: number; total: number }; judging_closed: boolean };

export type Review = {
  id: string;
  judge: { id: string; name: string; external_id: string | null };
  project: { id: string; title: string; external_id: string | null };
  cells: ScoreCell[];
  weighted: number | null;
  comment: string;
  submitted: boolean;
  updated_at: string | null;
};

export type PairCard = { id: string; title: string; summary: string; track: string | null; repo_url: string };
export type PairNext = { done: true; compared: number } | { done: false; left: PairCard; right: PairCard; compared: number; possible: number };

export type DashboardJudge = {
  judge_id: string;
  name: string;
  email: string;
  external_id: string | null;
  assigned: number;
  completed: number;
  drafts: number;
  status: "done" | "in_progress" | "not_started";
  last_activity: string | null;
  mean_score: number | null;
  constant_rater: boolean;
};
export type Dashboard = {
  generated_at: string;
  kpis: {
    projects: number;
    judges: number;
    reviews_submitted: number;
    reviews_assigned: number;
    completion: number; // 0..1
    judges_not_started: number;
    projects_below_target: number;
    votes: number;
  };
  judges: DashboardJudge[];
  coverage: { target: number; histogram: { reviews: number; projects: number }[] };
  integrity: {
    constant_raters: DashboardJudge[];
    duplicates: { project_id: string; title: string; duplicate_of: string | null; reason: string }[];
    under_reviewed: { project_id: string; title: string; reviews: number }[];
    shared_ip_ballots: number;
    outlier_reviews: number;
  };
  activity: { seq: number; summary: string; action: string; at: string }[];
};

export type NormalizationRow = {
  rank: number;
  raw_rank: number;
  rank_delta: number;
  project: { id: string; title: string; track: string | null; team: string };
  n_reviews: number;
  raw_mean: number;
  adjusted: number;
  std_error: number;
};
export type NormalizationRun = {
  id: string;
  method: string;
  params: { lambda_judge: number; lambda_project: number; drop_constant_raters: boolean };
  created_at: string;
  mu: number;
  sigma: number;
  reviews_used: number;
  cross_check: { method: string; pairs: number; kendall_tau_bt_vs_adjusted: number | null; kendall_tau_raw_vs_adjusted: number } | null;
  judge_offsets?: { judge_id: string; name: string; offset: number; excluded: boolean }[]; // organizers only
  excluded_judges?: { judge_id: string; name: string }[]; // organizers only
  outliers?: Outlier[]; // organizers only: reviews > 2.5 residual SDs from the model
  rows: NormalizationRow[];
};
export type Outlier = { judge_id: string; judge: string; project_id: string; title: string; residual: number; z: number };
export type PairwiseRanking = { submission_id: string; title: string; mu: number; se: number; wins: number; losses: number }[];

export type Results = {
  published: boolean;
  judging_mode: "rubric" | "pairwise";
  prizes: string[];
  judging: NormalizationRun | null;
  pairwise?: { ranking: PairwiseRanking; params: { prior: number; comparisons: number } } | null;
  popular_vote: { project_id: string; title: string; votes: number }[];
};

export type Ballot = {
  token: string;
  confirmed: boolean;
  vote_mode: "one_person_one_vote" | "quadratic";
  budget: number;
  spent: number;
  voting_open: boolean;
  closes_at: string | null;
  projects: Project[];
  votes: Record<string, number>; // project id -> units
};

export type AuditEntry = {
  seq: number;
  at: string;
  actor: string;
  action: string;
  summary: string;
  resource: string;
  payload: Record<string, unknown>;
  hash: string;
  prev_hash: string;
};

export type Person = {
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
  external_id: string | null;
  track_ids: string[];
  claimed: boolean;
};

export type SignedRecord = {
  id: string;
  kind: "judge" | "participant" | "winner";
  payload: Record<string, unknown> & { record_id: string; subject: { name: string; email_sha256: string }; event: { slug: string; name: string }; issued_at: string };
  canonical: string; // exact bytes that were signed (UTF-8)
  signature: string; // hex Ed25519 signature
  algorithm: "Ed25519";
  key_id: string;
  revoked: boolean;
  verify_url: string;
  certificate_url: string;
  public_key_pem?: string;
  public_jwk?: { kty: "OKP"; crv: "Ed25519"; x: string; kid: string };
};

export type Webhook = { id: string; url: string; actions: string[]; active: boolean; created_at: string; delivered?: number; pending?: number; failed?: number; secret?: string };
export type WebhookDelivery = { id: string; action: string; status: "pending" | "delivered" | "failed"; status_code: number | null; attempts: number; last_error: string; next_attempt_at: string; created_at: string };
export type ApiKey = { id: string; name: string; prefix: string; revoked: boolean; last_used_at: string | null; created_at: string; secret?: string; header?: string };

/** GET /v1/auth/work: one item per event where the signed-in user has a role. Drives the home screen. */
export type WorkItem = {
  event: EventSummary;
  role: Exclude<Role, "visitor">;
  judge?: { assigned: number; done: number };
  organizer?: { reviews_assigned: number; reviews_submitted: number };
  participant?: { team_id: string; submission_status: Submission["status"] | null; title: string | null };
};
