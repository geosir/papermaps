// Compute actual positions for display elements in preparation for rendering.
import {slide} from "./Utils";
import {solveLP} from "./Common";

export const processLayoutForLanes = async (data, selectedKW) => {
    const params = data.params;

    // Optimize layout by linear programming - minimizing "edge skew" and minimizing "line overlap"
    // Edge skew is the absolute horizontal difference between two adjacent nodes on a storyline.
    // Line overlap is the amount by which storylines cross into an unrelated title and its padding space.
    //
    // So MIN Objective = J1 + J2 + ... + S1 + S2 ... where Jn are intermediate variables representing "edge skew"
    // and Sn are intermediate variables representing "line spacing" between titles and storylines.
    //
    // Subject to edge skew constraints:
    //
    // [paper A keyword position] - [paper B keyword position] < [edge skew objective variable]
    // where paper A is the current paper and paper B is the previous paper.
    //
    // More specifically, that's
    // ([paper A offset variable] + [paper A node offset constant])
    //      - ([paper B offset variable] + [paper B node offset constant])
    //      < [edge skew objective variable]
    // For each pair of adjacent nodes (A,B), both orders.
    // This can be written in canonical LP form as
    // [paper A offset variable] - [paper B offset variable] - [objective variable]
    //      < [paper B node offset constant] - [paper A offset constant]
    //
    //
    // Subject to line spacing constraints:
    //
    // [line overlap objective variable] > MIN(
    //      [line position] - ([paper B offset variable] - [padding constant]),                     <- line overlapping from left
    //      ([paper C offset variable] + [paper B width] + [padding constant]) - [line position]    <- line overlapping from right
    // )
    // where
    // [line position] = [paper A offset variable] + [paper A keyword position]
    //      + (i / n) * ([paper C offset variable] + [paper C keyword position] - [paper A offset variable] - [paper A keyword position])
    // where paper A is the previous paper, paper B is the current paper, and paper C is the next paper. Note that this is different than above.
    // ANd where n is the index difference between paper C and paper A, and i is paper C's position within this difference.
    //
    // Using a binary selection variable to selectively relax exactly one of these branches,
    // this can be written in canonical LP form as:
    //
    // (overlapping from left)
    // [paper B offset variable]
    //      - (i / n) * [paper C offset variable] + (i / n - 1) * [paper A offset variable]
    //      + [BIG_NUMBER] * [binary choice] + [line overlap objective]
    //      > [paper A keyword position] + (i / n) * ([paper C keyword position] - [paper A keyword position]) + [padding constant]
    //
    // and
    //
    // (overlapping from right)
    // -[paper B offset variable]
    //      + (i / n) * [paper C offset variable] + (1 - i / n) * [paper A offset variable]
    //      - [BIG_NUMBER] * [binary choice] + [line overlap objective]
    //      > [paper B width] + [padding constant] - [paper A keyword position]
    //          - (i / n) * ([paper C keyword position] - [paper A keyword position]) - [BIG_NUMBER]

    // Generate model
    const lpmodel = {
        optimize: "objective",
        opType: "min",
        constraints: {},
        variables: {},
        ints: {}
    };

    const edges = data.edges;
    const sequence = data.sequence;

    // Edge-skew optimization
    Object.entries(edges).forEach(([keyword, edge]) => {
        if (selectedKW !== undefined && !selectedKW.includes(keyword)) return; // Ignore unfocused edges
        edge.forEach((segment, j) => {
            slide(segment, (curr, prev, i) => {
                // constraint for edge of keyword, segment j, minSkew on node i, positive direction:
                // paper A = curr, paper B = prev
                // [paper A offset variable] - [paper B offset variable] - [objective variable]
                // < [paper B node offset constant] - [paper A offset constant]

                // "< [paper B node offset constant] - [paper A offset constant]"
                const posConstraintName = `e${keyword}[${j}]_minSkew[${i}]_pos`;
                lpmodel.constraints[posConstraintName] = {max: prev.x - curr.x};

                // "[paper A offset variable]"
                if (!lpmodel.variables[`p${curr.pid}`]) lpmodel.variables[`p${curr.pid}`] = {};
                lpmodel.variables[`p${curr.pid}`][posConstraintName] = 1;

                // "- [paper B offset variable]"
                if (!lpmodel.variables[`p${prev.pid}`]) lpmodel.variables[`p${prev.pid}`] = {};
                lpmodel.variables[`p${prev.pid}`][posConstraintName] = -1;

                // "- [objective variable]"
                lpmodel.variables[`J_${posConstraintName}`] = {
                    [posConstraintName]: -1,
                    objective: Math.pow(data.keywords[keyword].count, 2) * params.straightWeight  // add to Objective = J1 + J2 + J3...
                };

                // constraint for edge of keyword, segment j, minSkew on node i, negative direction:
                // paper A = curr, paper B = prev
                // [paper A offset variable] - [paper B offset variable] - [objective variable]
                // < [paper B node offset constant] - [paper A offset constant]

                // "< [paper B node offset constant] - [paper A offset constant]"
                const negConstraintName = `e${keyword}[${j}]_minSkew[${i}]_neg`;
                lpmodel.constraints[negConstraintName] = {max: curr.x - prev.x};

                // "[paper A offset variable]"
                if (!lpmodel.variables[`p${prev.pid}`]) lpmodel.variables[`p${prev.pid}`] = {};
                lpmodel.variables[`p${prev.pid}`][negConstraintName] = 1;

                // "- [paper B offset variable]"
                if (!lpmodel.variables[`p${curr.pid}`]) lpmodel.variables[`p${curr.pid}`] = {};
                lpmodel.variables[`p${curr.pid}`][negConstraintName] = -1;

                // "- [objective variable]"
                lpmodel.variables[`J_${negConstraintName}`] = {
                    [negConstraintName]: -1,
                    objective: Math.pow(data.keywords[keyword].count, 2) * params.straightWeight // add to Objective = J1 + J2 + J3...
                };
            });
        });
    });

    Object.entries(edges).forEach(([keyword, edge]) => {
        if (selectedKW !== undefined && !selectedKW.includes(keyword)) return; // Ignore unfocused edges
        edge.forEach((segment, j) => {
            slide(segment, (next, prev) => {
                const prevIndex = data.papers[prev.pid].index;
                const nextIndex = data.papers[next.pid].index;
                if (nextIndex - prevIndex > 1) {
                    const delta = nextIndex - prevIndex;
                    for (let i = 0; i < delta; i++) {
                        const currIndex = prevIndex + i;
                        const currPaper = data.papers[sequence[currIndex]];

                        // Ignore papers that don't have any focused keywords
                        if (selectedKW !== undefined &&
                            !(currPaper.hasEdge && currPaper.keywords.some((k) => selectedKW.includes(k)))) return;

                        // Initialize variables
                        if (!lpmodel.variables[`S_${sequence[currIndex]}`]) {
                            lpmodel.variables[`S_${sequence[currIndex]}`] = {
                                // "+ [line spacing objective]"
                                objective: params.spaceWeight // add to Objective = J1 + J2 + ... - S1 - S2
                            };
                        }
                        if (!lpmodel.variables[`p${sequence[currIndex]}`])
                            lpmodel.variables[`p${sequence[currIndex]}`] = {};
                        if (!lpmodel.variables[`p${prev.pid}`])
                            lpmodel.variables[`p${prev.pid}`] = {};
                        if (!lpmodel.variables[`p${next.pid}`])
                            lpmodel.variables[`p${next.pid}`] = {};

                        // constraint for overlap between edge of keyword, segment j and title at currIndex, line overlapping from left
                        // paper A = prev node, paper B = paper getting overlapped, paper C = next node
                        // [paper B offset variable]
                        //      - (i / n) * [paper C offset variable] + (i / n - 1) * [paper A offset variable]
                        //      + [BIG_NUMBER] * [binary choice] + [line overlap objective]
                        //      > [paper A keyword position] + (i / n) * ([paper C keyword position] - [paper A keyword position]) + [padding constant]

                        const constraintName = `s${keyword}[${j}]_space[${currIndex}]`;
                        // "[paper B offset variable]"
                        lpmodel.variables[`p${sequence[currIndex]}`][constraintName + "_l"] = 1;
                        // "- (i / n) * [paper C offset variable]"
                        lpmodel.variables[`p${next.pid}`][constraintName + "_l"] = -i / delta;
                        // "+ (i / n - 1) * [paper A offset variable]"
                        lpmodel.variables[`p${prev.pid}`][constraintName + "_l"] = i / delta - 1;
                        // "+ [BIG_NUMBER] * [binary choice]" is done once at the end
                        // "+ [line overlap objective]"
                        lpmodel.variables[`S_${sequence[currIndex]}`][constraintName + "_l"] = 1;
                        // "> [paper A keyword position] + (i / n) * ([paper C keyword position] - [paper A keyword position]) + [padding constant]"
                        lpmodel.constraints[constraintName + "_l"] = {
                            min: prev.x + (i / delta) * (next.x - prev.x) + params.xSpace
                        };

                        // constraint for overlap between edge of keyword, segment j and title at currIndex, line overlapping from right
                        // paper A = prev node, paper B = paper getting overlapped, paper C = next node
                        // -[paper B offset variable]
                        //      + (i / n) * [paper C offset variable] + (1 - i / n) * [paper A offset variable]
                        //      - [BIG_NUMBER] * [binary choice] + [line overlap objective]
                        //      > [paper B width] + [padding constant] - [paper A keyword position]
                        //          - (i / n) * ([paper C keyword position] - [paper A keyword position]) - [BIG_NUMBER]

                        // "-[paper B offset variable]"
                        lpmodel.variables[`p${sequence[currIndex]}`][constraintName + "_r"] = -1;
                        // "+ (i / n) * [paper C offset variable]"
                        lpmodel.variables[`p${next.pid}`][constraintName + "_r"] = i / delta;
                        // "+ (1 - i / n) * [paper A offset variable]"
                        lpmodel.variables[`p${prev.pid}`][constraintName + "_r"] = 1 - i / delta;
                        // "- [BIG_NUMBER] * [binary choice]" is done once at the end
                        // "+ [line overlap objective]"
                        lpmodel.variables[`S_${sequence[currIndex]}`][constraintName + "_r"] = 1;
                        // "> [paper B width] + [padding constant] - [paper A keyword position]
                        //      - (i / n) * ([paper C keyword position] - [paper A keyword position]) - [BIG_NUMBER]"
                        lpmodel.constraints[constraintName + "_r"] = {
                            min: currPaper.layout.width + params.xSpace - prev.x - (i / delta) * (next.x - prev.x) - params.bigNumber
                        };

                        // Binary variable
                        lpmodel.variables[`b${keyword}[${currIndex}]`] = {
                            // Overlap from left: "+ [BIG_NUMBER] * [binary choice]"
                            [constraintName + "_l"]: params.bigNumber,
                            // Overlap from right: "- [BIG_NUMBER] * [binary choice]"
                            [constraintName + "_r"]: -params.bigNumber,
                        };
                        lpmodel.ints[`b${keyword}[${currIndex}]`] = 1;
                    }
                }
            });
        });
    });

    console.log(lpmodel);
    const [status, results] = await solveLP(lpmodel);
    data.lpstatus = status;
    console.log(results);

    const minPos = Object.values(data.papers).reduce((acc, p) => {
        const x = results[`p${p.Id}`];
        if (x > 0) {
            if (acc) return Math.min(acc, x)
            else return x
        } else return acc
    }, undefined);

    Object.values(data.papers).forEach(paper => {
        const x = results[`p${paper.Id}`];
        if (x === undefined) paper.layout.x = -250;
        else if (minPos) paper.layout.x = x - minPos; // Normalize position
        else paper.layout.x = x;
        paper.unmapped = (x === undefined) && !paper.keywords.some((k) => selectedKW.includes(k));
    });

    return data;
}