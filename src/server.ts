import express from "express";
import "dotenv/config";

import departmentsRouter from "./routes/departments";
import jobsRouter from "./routes/jobs";
import applicationsRouter from "./routes/applications";
import usersRouter from "./routes/users";
import companiesRouter from "./routes/companies";
import applicationExtrasRouter from "./routes/applicationExtras";
import authRouter from "./routes/auth";
import publicJobsRouter from "./routes/publicJobs";
import employeesRouter from "./routes/employees";
import reportsRouter from "./routes/reports";
import { tenantContext } from "./middleware/tenantContext";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(publicJobsRouter);
app.use(authRouter);
app.use(tenantContext);

app.use(usersRouter);
app.use(companiesRouter);
app.use(employeesRouter);
app.use(reportsRouter);

app.use(departmentsRouter);
app.use(jobsRouter);
app.use(applicationsRouter);
app.use(applicationExtrasRouter);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`[server] API listening on http://localhost:${PORT}`);
});




