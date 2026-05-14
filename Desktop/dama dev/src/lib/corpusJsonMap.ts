export function rawJsonToItemDetail(json: any): any {
  return {
    suttaid: json.suttaid || "",
    sutta: json.sutta || "",
    commentry: json.commentry || "",
    ...json
  };
}

export function passesCorpusGate(item: any): boolean {
  return !!item.suttaid;
}

export function itemSummaryFromDetail(item: any): any {
  return {
    suttaid: item.suttaid,
    title: item.title || item.suttaid
  };
}
