export const NATION_FLAGS = {
    "india": "in",
    "ind": "in",
    "australia": "au",
    "aus": "au",
    "south africa": "za",
    "sa": "za",
    "england": "gb-eng",
    "eng": "gb-eng",
    "new zealand": "nz",
    "nz": "nz",
    "west indies": "wi",
    "wi": "wi",
    "afghanistan": "af",
    "afg": "af",
    "sri lanka": "lk",
    "sl": "lk",
    "bangladesh": "bd",
    "ban": "bd",
    "ireland": "ie",
    "ire": "ie",
    "zimbabwe": "zw",
    "zim": "zw",
    "netherlands": "nl",
    "ned": "nl",
    "scotland": "gb-sct",
    "sco": "gb-sct",
    "nepal": "np",
    "usa": "us",
    "canada": "ca",
    "oman": "om",
    "uae": "ae",
    "namibia": "na"
};

export const getFlagUrl = (nationality) => {
    if (!nationality) return null;
    const cleanNation = nationality.toLowerCase().trim();
    const code = NATION_FLAGS[cleanNation];

    if (!code && !cleanNation.includes("indies")) return null;

    // West Indies specific handling
    if (code === "wi" || cleanNation.includes("indies")) {
        return "https://upload.wikimedia.org/wikipedia/en/thumb/9/9b/Cricket_West_Indies_logo.svg/200px-Cricket_West_Indies_logo.svg.png";
    }

    if (!code) return null;
    return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
};

export const getRoleDisplayName = (role) => {
    if (!role) return "BAT";
    const r = role.toLowerCase();
    if (r.includes("bat") || r.includes("bt")) return "BAT";
    if (r.includes("bowl") || r.includes("bw")) return "BOWL";
    if (r.includes("all") || r.includes("ar")) return "AR";
    if (r.includes("wk") || r.includes("wicket") || r.includes("keeper")) return "WK";
    return "BAT"; // Default
};
