export const NATION_FLAGS = {
    "india": "in",
    "ind": "in",
    "australia": "au",
    "aus": "au",
    "south africa": "za",
    "sa": "za",
    "england": "gb",
    "eng": "gb",
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
    "namibia": "na",
    "unknown": null
};

export const getFlagUrl = (nationality) => {
    if (!nationality) return null;
    const cleanNation = nationality.toLowerCase().trim()
        .replace(/\./g, '') // Remove dots (e.g., S.A -> SA)
        .replace(/\s+/g, ' '); // Normalize spaces

    // Try direct mapping
    let code = NATION_FLAGS[cleanNation];

    // Try substring matching if no direct hit
    if (!code) {
        if (cleanNation.includes("india")) code = "in";
        else if (cleanNation.includes("australia")) code = "au";
        else if (cleanNation.includes("south africa") || cleanNation === "sa") code = "za";
        else if (cleanNation.includes("england")) code = "gb";
        else if (cleanNation.includes("new zealand") || cleanNation === "nz") code = "nz";
        else if (cleanNation.includes("indies") || cleanNation === "wi") code = "wi";
        else if (cleanNation.includes("afghanistan") || cleanNation === "afg") code = "af";
        else if (cleanNation.includes("sri lanka") || cleanNation === "sl") code = "lk";
        else if (cleanNation.includes("bangladesh") || cleanNation === "ban") code = "bd";
    }

    if (!code && !cleanNation.includes("indies")) return null;

    // West Indies specific handling (using their official cricket logo)
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

/**
 * fmtCr — converts an internal Lakhs value to a Crores display string.
 * Examples: 200 → "₹2Cr"  |  150 → "₹1.5Cr"  |  50 → "₹0.5Cr"  |  0/null → "₹0Cr"
 */
export const fmtCr = (lakhs) => {
    if (!lakhs && lakhs !== 0) return '₹0Cr';
    const cr = lakhs / 100;
    // Show up to 2 decimal places, strip trailing zeros
    const formatted = parseFloat(cr.toFixed(2));
    return `₹${formatted}Cr`;
};

