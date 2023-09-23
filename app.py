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
    query = f"q={urllib.parse.quote(expr)}&rows={count}&fl={fields}&sort=citation_count+desc"
    target = f"https://api.adsabs.harvard.edu/v1/search/query?{query}"
    headers = {'Authorization': 'Bearer:Xobd9QCbDX4rfyjgE4oh1J9vPQMuqEaHdGIqwEjS'}
    print("QUERY", target)
    res = requests.get(target, headers=headers)
    json = res.json()
    if 'response' in json:
        # Pre-process results
        if 'docs' in json['response']:
            for doc in json['response']['docs']:
                if 'title' in doc:
                    doc['title'] = doc['title'][0]
        return json['response']
    else:
        return {}


# Get a set of papers' backwards references
def ads_get_refs(bibcodes, count=DEFAULT_COUNT, fields=None):
    if len(bibcodes) == 0:
        return []
    joined_bibcodes = " OR ".join(bibcodes)
    result = ads_query(f"references({joined_bibcodes})", count=count, fields=fields)
    return result['docs'] if 'docs' in result else []


# Get a paper's forward citations
def ads_get_cites(bibcodes, count=DEFAULT_COUNT, fields=None):
    if len(bibcodes) == 0:
        return []
    joined_bibcodes = " OR ".join(bibcodes)
    result = ads_query(f"citations({joined_bibcodes})", count=count, fields=fields)
    return result['docs'] if 'docs' in result else []


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
    if ',' in query:
        chain_querry = " OR ".join(f"bibcode:{b}" for b in query.split(','))
        bibcodes_q = ads_query(chain_querry, fields=fields, count=count)
        if 'docs' in bibcodes_q and len(bibcodes_q['docs']) > 0:
            result = bibcodes_q['docs']

    if result is None:
        bibcodes_q = ads_query(f'bibcode:{query}', fields=fields, count=count)
        if 'docs' in bibcodes_q and len(bibcodes_q['docs']) > 0:
            result = bibcodes_q['docs']

    # Search as DOI
    if result is None:
        doi_q = ads_query(f'doi:{query}', fields=fields, count=count)
        if 'docs' in doi_q and len(doi_q['docs']) > 0:
            result = doi_q['docs']

    # Search directly
    if result is None:
        direct_q = ads_query(query, fields=fields, count=count)
        if 'docs' in direct_q and len(direct_q['docs']) > 0:
            result = direct_q['docs']

    if result is None:
        return jsonify({
            'status': 'error',
            'reason': "No results",
            'context': {'query': query}}), 404

    print(f"GET_PAPER -> {len(result)} results")
    return jsonify({'status': 'success', 'result': result})


@app.route("/api/get_refs")
@cross_origin()
def get_refs():
    bibcode = request.args.get('id')
    if ',' in bibcode:
        # Provided a list of ids
        bibcodes = bibcode.split(',')
    else:
        bibcodes = [bibcode]
    count = int(request.args.get('n') or DEFAULT_COUNT)

    fields = ((['abstract'] if request.args.get('abs') else []) +
              (['citation'] if request.args.get('citedBy') else []) +
              DEFAULT_FIELDS)
    results = ads_get_refs(bibcodes, count=count, fields=fields)

    print(f"GET_REFS -> {len(results)} results")
    return jsonify({'status': 'success', 'result': results})


@app.route("/api/get_cites")
@cross_origin()
def get_cites():
    bibcode = request.args.get('id')
    if ',' in bibcode:
        # Provided a list of ids
        bibcodes = bibcode.split(',')
    else:
        bibcodes = [bibcode]
    count = int(request.args.get('n') or DEFAULT_COUNT)

    fields = ((['abstract'] if request.args.get('abs') else []) +
              (['citation'] if request.args.get('citedBy') else []) +
              DEFAULT_FIELDS)
    results = ads_get_cites(bibcodes, count=count, fields=fields)

    print(f"GET_CITES -> {len(results)} results")
    return jsonify({'status': 'success', 'result': list(results)})


@app.route("/api/solve", methods=['POST'])
@cross_origin(origin='*')
def solve():
    data = request.json

    print("SOLVE LP", data)

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
