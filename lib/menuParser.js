function extractVariables(menu) {

    const vars = [];

    function walk(node) {

        if (node.object) {

            node.object.forEach(obj => {

                if (obj.$?.uri) {

                    vars.push({
                        name: obj.$.name,
                        uri: obj.$.uri
                    });

                }

                walk(obj);

            });

        }

        if (node.fub) {
            node.fub.forEach(f => walk(f));
        }

    }

    walk(menu);

    return vars;

}

module.exports = { extractVariables };
