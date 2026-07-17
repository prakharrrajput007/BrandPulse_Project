Readme

Run Process

Step 1: Backend folder-> run command "node server.js"
Step 2: Backend folder-> run command "venv\Scripts\activate" (for mac: "source venv/bin/activate")
Step 3: once the virtual environment open: Run command: "python -m processing.run_pipeline" then "python -m processing.ml_analyzer"
Step 4: Backend Folder-> in the venv environment run command "uvicorn main:app --reload"
Step 5: Frontend folder-> run command "npm run dev"