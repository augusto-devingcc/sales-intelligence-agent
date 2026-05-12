export type ScrapeResult = {
  url: string;
  title: string | null;
  description: string | null;
  text: string;
  nav_links: string[];
};

export type Classification = {
  industry: string | null;
  size_estimate: string | null;
  tech_stack: string[];
  description: string | null;
  pain_points: string[];
};

export type CompanyExtras = {
  founded_year: number | null;
  location: string | null;
  social_links: Record<string, string>;
};

export type GeneratedEmail = {
  subject: string;
  body: string;
};

export type FinalCompanyPayload = {
  domain: string;
  name: string | null;
  classification: Classification;
  extras: CompanyExtras;
  email: GeneratedEmail;
};

export type AgentStep = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  duration_ms: number;
  iteration: number;
};
