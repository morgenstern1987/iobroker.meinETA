function normalizeName(name) {

    return name
        .toLowerCase()
        .replace(/[^\w]+/g, "_")
        .replace(/^_+|_+$/g, "");

}

function buildObjectPath(pathArray) {

    return pathArray
        .map(normalizeName)
        .join(".");

}

module.exports = {
    normalizeName,
    buildObjectPath
};
