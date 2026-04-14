function extractVariables(menu) {

    const vars = [];

    function walk(node, path = []) {

        if (node.object) {

            node.object.forEach(obj => {

                const name = obj.$?.name || "unknown";
                const uri = obj.$?.uri;

                const newPath = [...path, name];

                if (uri) {

                    vars.push({
                        name,
                        uri,
                        path: newPath
                    });

                }

                walk(obj, newPath);

            });

        }

        if (node.fub) {
            node.fub.forEach(f => walk(f, path));
        }

    }

    walk(menu);

    return vars;

}

module.exports = { extractVariables };
