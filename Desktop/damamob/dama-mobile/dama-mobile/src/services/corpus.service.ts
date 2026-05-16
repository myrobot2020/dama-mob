import { SuttaData } from '../types/sutta.types';

export class CorpusService {
  private static instance: CorpusService;
  private cache: Map<string, SuttaData> = new Map();

  static getInstance(): CorpusService {
    if (!CorpusService.instance) {
      CorpusService.instance = new CorpusService();
    }
    return CorpusService.instance;
  }

  async fetchSutta(suttaId: string): Promise<SuttaData | null> {
    if (this.cache.has(suttaId)) return this.cache.get(suttaId)!;
    
    const match = suttaId.match(/AN\s*(\d+)\.(\d+)\.(\d+)/i);
    if (!match) return null;
    
    const book = match[1];
    const suttaNum = `${match[1]}.${match[2]}.${match[3]}`;
    
    try {
      const data = require(`../../assets/data/validated-json/an/an${book}/${suttaNum}.json`) as SuttaData;
      if (data?.valid) {
        this.cache.set(suttaId, data);
        return data;
      }
    } catch(e) {}
    return null;
  }

  async findTextPosition(suttaId: string, searchText: string): Promise<any> {
    const sutta = await this.fetchSutta(suttaId);
    if (!sutta) return null;
    let idx = sutta.sutta.indexOf(searchText);
    if (idx !== -1) return { start: idx, end: idx + searchText.length, kind: 'sutta' };
    if (sutta.commentary) {
      idx = sutta.commentary.indexOf(searchText);
      if (idx !== -1) return { start: idx, end: idx + searchText.length, kind: 'commentary' };
    }
    return null;
  }
}
