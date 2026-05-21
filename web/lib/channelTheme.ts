/**
 * 채널 약어 + 글자색 — 캘린더 카드 prefix.
 * 사용자 요청: "N, K 진하게 보이게". 굵기 + 진한 색 강조.
 */
export interface ChannelTheme {
  abbr: string;
  label: string;
  /** 진한 글자색 (다크 톤) — 카드 prefix 용 */
  bold: string;
}

export const CHANNEL_THEME: Record<string, ChannelTheme> = {
  naver_smartstore: { abbr: "N",   label: "네이버",          bold: "text-emerald-700" },
  kakao_talkstore:  { abbr: "K",   label: "카카오",          bold: "text-yellow-700" },
  coupang_wing:     { abbr: "C",   label: "쿠팡",            bold: "text-rose-700" },
  "11st_soffice":   { abbr: "11",  label: "11번가",          bold: "text-red-700" },
  toss_shopping:    { abbr: "T",   label: "토스",            bold: "text-sky-700" },
  esmplus:          { abbr: "ESM", label: "G마켓/옥션",      bold: "text-orange-700" },
  ns_homeshopping:  { abbr: "NS",  label: "NS홈쇼핑",        bold: "text-purple-700" },
  shoppingnT:       { abbr: "엔티", label: "쇼핑엔티",        bold: "text-fuchsia-700" },
  fanfandaero:      { abbr: "F",   label: "판판대로(정부)",   bold: "text-stone-700" },
  sellernow:        { abbr: "SN",  label: "셀러나우",         bold: "text-slate-700" },
  onmd_mdlounge:    { abbr: "O",   label: "ONMD",            bold: "text-indigo-700" },
  iboss:            { abbr: "보",  label: "아이보스",         bold: "text-zinc-700" },
};

export const FALLBACK_THEME: ChannelTheme = { abbr: "?", label: "기타", bold: "text-gray-700" };

export function themeOf(channelKey: string): ChannelTheme {
  return CHANNEL_THEME[channelKey] ?? FALLBACK_THEME;
}
