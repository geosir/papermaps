import urllib.parse
import requests
import random
import time
import csv
import os

from datetime import date

from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin

import pulp as pl

# Flask
app = Flask(__name__, static_folder='app', static_url_path="/app")
app.config['CORS_HEADERS'] = 'Content-Type'

CORS(app)

# === PARAMETERS =========================


DEFAULT_COUNT = 100
DEFAULT_FIELDS = ['bibcode', 'title', 'year', 'author', 'citation_count']
# DEFAULT_ATTR = ['Id', 'Ti', 'DN', 'Y', 'AA.DAuN', 'RId', 'CC', 'VSN', 'VFN', 'S']
SOLVER_TIMEOUT = 10


# === VIEWS===============================

# Run a query on Astrophysics Data System (ADS)
# https://ui.adsabs.harvard.edu/help/api/api-docs.html
def ads_query(expr, count=DEFAULT_COUNT, fields=None):
    fields = ",".join(fields or DEFAULT_FIELDS)
    query = f"q={urllib.parse.quote(expr)}&rows={count}&fl={fields}"
    target = f"https://api.adsabs.harvard.edu/v1/search/query?{query}"
    headers = {'Authorization': 'Bearer:Xobd9QCbDX4rfyjgE4oh1J9vPQMuqEaHdGIqwEjS'}
    print("QUERY", target)
    res = requests.get(target, headers=headers)
    json = res.json()
    if 'response' in json:
        return json['response']
    else:
        return {}


# Get a set of papers' backwards references
def ads_get_refs(ids, count=DEFAULT_COUNT, attributes=None):
    raise NotImplementedError
    # if len(ids) == 0:
    #     return []
    # paper_query_list = ",".join(f"Id={ID}" for ID in ids)
    # papers_result = mag_query(f'Or({paper_query_list})', count=len(ids), attributes=['RId'])
    # if 'entities' not in papers_result:
    #     return []
    # papers = papers_result['entities']
    # parent_ids = list(set(ID for p in papers if 'RId' in p for ID in p['RId']))
    # if len(parent_ids) == 0:
    #     return []
    # random.shuffle(parent_ids)
    # parents_query_list = ",".join(f"Id={ID}" for ID in parent_ids[:count])
    # result = mag_query(f"Or({parents_query_list})", count=count, attributes=attributes)
    # return result['entities'] if 'entities' in result else []


# Get a paper's forward citations
def mag_get_cites(ids, count=DEFAULT_COUNT, attributes=None):
    raise NotImplementedError
    # if len(ids) == 0:
    #     return []
    # child_query_list = ",".join(f"RId={ID}" for ID in ids)
    # result = mag_query(f"Or({child_query_list})", count=count, attributes=attributes)
    # return result['entities'] if 'entities' in result else []


# Reconstruct a paper's abstract from the InvertedAbstract given by MAG.
def construct_abstract(paper):
    if 'IA' not in paper:
        # No InvertedAbstract. Do nothing.
        return paper

    abstract = ['?'] * paper['IA']['IndexLength']
    for token, positions in paper['IA']['InvertedIndex'].items():
        for pos in positions:
            abstract[pos] = token

    paper['abstract'] = " ".join(abstract)
    return paper


# === ROUTES =============================


@app.route("/", defaults={'path': ''})
@app.route("/<path:path>")
def handle_spa(path):
    return app.send_static_file("index.html")


@app.route("/api/get_paper")
@cross_origin()
def get_paper():
    query = request.args.get('q')
    count = int(request.args.get('n') or DEFAULT_COUNT)
    if query is None:
        return jsonify({
            'status': 'error',
            'reason': "Missing query variable: q",
            'context': {'q': query}}), 400

    result = None
    fields = ((['abstract'] if request.args.get('abs') else []) +
              (['citation'] if request.args.get('citedBy') else []) +
              DEFAULT_FIELDS)

    # First search as direct Bibcode
    bibcode_q = ads_query(f'bibcode:{query}', fields=fields, count=count)
    if 'docs' in bibcode_q and len(bibcode_q['docs']) > 0:
        result = bibcode_q['docs']

    # Search as DOI
    if result is None:
        doi_q = ads_query(f'doi:{query}', fields=fields, count=count)
        if 'docs' in doi_q and len(doi_q['docs']) > 0:
            result = doi_q['docs']

    # Search as title keywords
    if result is None:
        ti_q = ads_query(f"title:\"{query}\"", fields=fields, count=count)
        if 'docs' in ti_q and len(ti_q['docs']) > 0:
            result = ti_q['docs']

    if result is None:
        return jsonify({
            'status': 'error',
            'reason': "No results",
            'context': {'query': query}}), 404

    return jsonify({'status': 'success', 'result': result})


@app.route("/api/get_refs")
@cross_origin()
def get_refs():
    ID = request.args.get('id')
    if ',' in ID:
        # Provided a list of ids
        ids = ID.split(',')
    else:
        ids = [ID]
    count = int(request.args.get('n') or DEFAULT_COUNT)

    attr = ((['CitCon'] if request.args.get('citcon') else []) +
            (['IA'] if request.args.get('abs') else []) +
            DEFAULT_ATTR)
    results = mag_get_refs(ids, count=count, attributes=attr)

    if request.args.get('abs'):
        results = list(map(construct_abstract, results))

    if request.args.get('citedBy'):
        for result in results:
            result['citedBy'] = [p['Id'] for p in mag_get_cites([result['Id']], count=count, attributes=['Id'])]

    return jsonify({'status': 'success', 'result': results})


@app.route("/api/get_cites")
@cross_origin()
def get_cites():
    ID = request.args.get('id')
    if ',' in ID:
        # Provided a list of ids
        ids = ID.split(',')
    else:
        ids = [ID]
    count = int(request.args.get('n') or DEFAULT_COUNT)

    attr = ((['CitCon'] if request.args.get('citcon') else []) +
            (['IA'] if request.args.get('abs') else []) +
            DEFAULT_ATTR)
    results = mag_get_cites(ids, count=count, attributes=attr)

    if request.args.get('abs'):
        results = list(map(construct_abstract, results))

    if request.args.get('citedBy'):
        for result in results:
            result['citedBy'] = [p['Id'] for p in mag_get_cites([result['Id']], count=count, attributes=['Id'])]

    return jsonify({'status': 'success', 'result': list(results)})


@app.route("/api/solve", methods=['POST'])
@cross_origin(origin='*')
def solve():
    data = request.json

    solver = pl.getSolver('PULP_CBC_CMD', timeLimit=SOLVER_TIMEOUT, threads=100)
    prob = pl.LpProblem("prob", pl.LpMinimize)

    vars = {}
    cons = {}
    for varname in data['variables']:
        if varname in data['ints']:
            vars[varname] = pl.LpVariable(varname, cat='Binary')
        else:
            vars[varname] = pl.LpVariable(varname, lowBound=0)

        for consname in data['variables'][varname]:
            if consname not in cons:
                cons[consname] = []
            cons[consname].append((varname, data['variables'][varname][consname]))

    print(len(vars), "variables")
    print(len(cons), "constraints")

    for consname in cons:
        lhs = sum(map(lambda e: vars[e[0]] * e[1], cons[consname]))
        if consname != "objective":
            if 'min' in data['constraints'][consname]:
                prob += lhs >= data['constraints'][consname]['min']
            else:
                prob += lhs <= data['constraints'][consname]['max']
        else:
            prob += lhs

    _start = time.time()
    prob.solve(solver)
    _end = time.time()

    timed_out = (_end - _start >= SOLVER_TIMEOUT)
    results = {}
    for varname in sorted(vars.keys()):
        results[varname] = vars[varname].value()

    return jsonify({'status': 'success', 'lpstatus': pl.LpStatus[prob.status] if not timed_out else "Suboptimal",
                    'result': results})


@app.route("/api/log_event", methods=['POST'])
@cross_origin(origin='*')
def log_event():
    data = request.json

    if not os.path.exists('logs'):
        os.makedirs('logs')

    with open(f"logs/usage_{date.today().strftime('%Y%m%d')}.log", "a") as logfile:
        writer = csv.writer(logfile)
        writer.writerow([data['sessionID'], data['event'], data['timestamp'], data['data']])

    return jsonify({'status': 'success'})
