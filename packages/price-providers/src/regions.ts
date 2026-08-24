export interface RegionRecord {
  id: string;
  name: string;
  shortName: string;
  pid: string;
}

export interface ProvinceResolution {
  requested_region: string;
  province_code: string;
  province_name: string;
}

const PROVINCES: Array<[string, string, string]> = [
  ["110000", "北京市", "北京"],
  ["120000", "天津市", "天津"],
  ["130000", "河北省", "河北"],
  ["140000", "山西省", "山西"],
  ["150000", "内蒙古自治区", "内蒙古"],
  ["210000", "辽宁省", "辽宁"],
  ["220000", "吉林省", "吉林"],
  ["230000", "黑龙江省", "黑龙江"],
  ["310000", "上海市", "上海"],
  ["320000", "江苏省", "江苏"],
  ["330000", "浙江省", "浙江"],
  ["340000", "安徽省", "安徽"],
  ["350000", "福建省", "福建"],
  ["360000", "江西省", "江西"],
  ["370000", "山东省", "山东"],
  ["410000", "河南省", "河南"],
  ["420000", "湖北省", "湖北"],
  ["430000", "湖南省", "湖南"],
  ["440000", "广东省", "广东"],
  ["450000", "广西壮族自治区", "广西"],
  ["460000", "海南省", "海南"],
  ["500000", "重庆市", "重庆"],
  ["510000", "四川省", "四川"],
  ["520000", "贵州省", "贵州"],
  ["530000", "云南省", "云南"],
  ["540000", "西藏自治区", "西藏"],
  ["610000", "陕西省", "陕西"],
  ["620000", "甘肃省", "甘肃"],
  ["630000", "青海省", "青海"],
  ["640000", "宁夏回族自治区", "宁夏"],
  ["650000", "新疆维吾尔自治区", "新疆"],
  ["710000", "台湾省", "台湾"],
  ["810000", "香港特别行政区", "香港"],
  ["820000", "澳门特别行政区", "澳门"],
];

export const STATIC_PROVINCE_RECORDS: RegionRecord[] = PROVINCES.map(([id, name, shortName]) => ({
  id,
  name,
  shortName,
  pid: "0",
}));

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

/** 将省、市或区县名称解析到省级行政区；歧义名称不猜测。 */
export function resolveProvince(region: string, records: RegionRecord[]): ProvinceResolution | null {
  const requested = normalize(region);
  if (!requested || requested === "全国") return null;
  const combined = [...records];
  for (const fallback of STATIC_PROVINCE_RECORDS) {
    if (!combined.some((record) => record.id === fallback.id)) combined.push(fallback);
  }
  const byId = new Map(combined.map((record) => [record.id, record]));
  const matches = combined.filter((record) =>
    [record.id, normalize(record.name), normalize(record.shortName)].includes(requested),
  );
  if (matches.length === 0) return null;
  const provinceMatch = matches.find((record) => record.pid === "0" || record.id.endsWith("0000"));
  let current = provinceMatch ?? (matches.length === 1 ? matches[0]! : null);
  if (!current) return null;
  const seen = new Set<string>();
  while (current.pid !== "0" && !current.id.endsWith("0000")) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    const parent = byId.get(current.pid);
    if (!parent) return null;
    current = parent;
  }
  return {
    requested_region: region.trim(),
    province_code: current.id,
    province_name: current.name,
  };
}
