PaperMaps
=====
Using Title Keywords for Visual Exploration of Academic Citation Networks
(George's Thesis 2020-2021)

This is an experimental layout intended to help researchers tell better stories of new topics areas they would like to
explore, to aid understanding and discovery of related works.

Docker Installation & Run (recommended)
-----

Installing with docker is super easy because it's been containerized to be consistent on every machine!

1. Build the papermaps docker container

```shell
./build_docker.sh
```

(You can edit this file to change the tag of the docker image.)

2. Run the docker container

```shell
./run_docker.sh
```

Papermaps will now be served at [http://localhost:8000](http://localhost:8000).

(You can edit this file to change the port mapping and other options.)


Local Installation
-----

1. Create a Python virtual environment:

```shell
virtualenv -p python3 env
```

2. Activate the virtual environment:

(The script in `env/bin` that you run may vary depending on your shell. For sh/bash:)

```shell
source env/bin/activate
```

3. Install Python requirements:

```shell
pip install -r requirements.txt
```

4. Set up React and dependencies for the website:

```shell
cd app
yarn install
```

Now you're all set to develop!


Running Locally for Development
-----

Just run:

```shell
./run.sh
```

Usage logs by date will appear in `logs/`.

Deploying to Production
-----

1. Deploy the backend server in `app.py`.

The quickest (but sloppy) way to do this is to serve it with Flask. This is how it's currently served from the research
site at [https://papermaps.me](https://papermaps.me). To serve with flask, just run:

```shell
FLASK_ENV=development flask run
```

This will host the backend server at `localhost:5000`. The research site is set up with nginx to proxy queries from
[https://papermaps.me/api](https://papermaps.me/api) to `localhost:5000`.

A better way to do this would be to modify `app.py` to be deployed as USGI or ASGI and use something like uvicorn to
serve it, which will provide production-quality hosting, notably multiple workers instead of the single-threaded debug
mode provided by `flask run`.

2. Build the production version of the website:

First, modify `src/constants/Values.js` so that `API_URL` points to the proper location. In development, it should be
`localhost:5000`, but in production, it should be `/api`.

Then compile the app:

```shell
cd app
make
```

The compiled website will now be in `app/build`.

3. Serve `build/` as a single-page-app.

For [https://papermaps.me](https://papermaps.me), this is accomplished using nginx to serve the `build/` directory as an
SPA. This is done by just routing all queries to `/` and all 404 errors to `build/index.html`.


Future Work
-----

* Cleaner layout when there are many keywords
* Indexing and visualizing keywords in abstracts
* Quality-of-life tools, such as paper viewing history, and marking papers as read.

Contents
-----

`app/`: The React website.

* `app/build`: Compiled website, ready for deployment to production
* `app/src`: React Source Code for the website
    * `app/src/assets`: Website CSS
    * `app/src/components`: Common modular components employed in the site
    * `app/src/constants`: Site-wide parameters.
    * `app/src/pages`: Pages of the website
    * `app/src/utils`: Common utilities and helpers used across the site
    * `app/src/App.js`: Main React entrypoint.
    * `app/Makefile`: Makefile used to build the React app for production.

`logs`: Usage logs for analysis in post.
`app.py`: The backend server, which handles paper retrieval and provides an LP solver.
`run.sh`: Script to run the backend server and serve the React website, both in development mode.


Contact
-----

George Moe can be contacted after graduation at [george@george.moe](mailto:george@george.moe).

