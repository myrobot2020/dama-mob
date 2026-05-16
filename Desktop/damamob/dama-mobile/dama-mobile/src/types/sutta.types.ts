export interface SuttaData {
  sutta_id: string;
  sutta_name_en?: string;
  sutta: string;
  commentary?: string;
  valid: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}
