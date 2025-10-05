const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const ROOT_DIR = path.resolve(__dirname, '..');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/server.js'], {
      cwd: ROOT_DIR,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        reject(new Error('El servidor no respondió dentro del tiempo esperado'));
        server.kill();
      }
    }, 10000);

    const handleData = (data) => {
      const text = data.toString();
      process.stdout.write(text);
      if (!resolved && text.includes('API listening')) {
        resolved = true;
        clearTimeout(timer);
        resolve(server);
      }
    };

    server.stdout.on('data', handleData);
    server.stderr.on('data', (data) => process.stderr.write(data.toString()));

    server.on('exit', (code) => {
      if (!resolved) {
        clearTimeout(timer);
        reject(new Error(`El servidor terminó antes de estar listo (code ${code})`));
      }
    });
  });
}

async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error ${method} ${path}: ${response.status} ${text}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function main() {
  console.log('[demo] Iniciando servidor local...');
  const server = await startServer();

  const stopServer = async () => {
    return new Promise((resolve) => {
      server.once('close', resolve);
      server.kill();
    });
  };

  try {
    console.log('[demo] Creando departamento "Tecnología"');
    const departmentResp = await request('POST', '/api/departments', { nombre: 'Tecnología' });
    const department = departmentResp.department;
    console.log('[demo] Departmento creado:', department);

    const jobPayload = {
      titulo: 'Ingeniero Backend Senior',
      descripcion: 'Responsable del diseño y desarrollo de microservicios Node.js.',
      departamento: department.nombre,
      departamento_id: department.department_id,
      tipo_empleo: 'tiempo_completo',
      modalidad_trabajo: 'hibrido',
      ubicacion: 'Lima, Perú',
      rango_salarial_min: 8000,
      rango_salarial_max: 12000,
      moneda: 'PEN',
      notas_internas: 'Rol crítico para el lanzamiento Q4.',
    };
    console.log('[demo] Creando oferta laboral');
    const jobResp = await request('POST', '/api/jobs', jobPayload);
    const job = jobResp.job;
    console.log('[demo] Job creado:', job);

    const applicationPayload = {
      job_id: job.job_id,
      candidato: {
        nombre_completo: 'María Torres',
        email: 'maria.torres@example.com',
        telefono: '+51 999 888 777',
        resumen_url: 'https://example.com/cv/maria-torres.pdf',
        linkedin_url: 'https://www.linkedin.com/in/mariatorres',
        ciudad: 'Lima',
        pais: 'Perú',
        fuente: 'LinkedIn',
      },
      estado: 'Nuevo',
      source: 'LinkedIn',
      source_details: 'Campaña Talent Acquisition 2025',
      salario_expectativa: 11000,
      moneda: 'PEN',
    };
    console.log('[demo] Creando aplicación de candidata');
    const applicationResp = await request('POST', '/api/applications', applicationPayload);
    const application = applicationResp.application;
    console.log('[demo] Application creada:', application);

    console.log('[demo] Listando departamentos');
    const departmentsList = await request('GET', '/api/departments');
    console.log(departmentsList);

    console.log('[demo] Listando ofertas');
    const jobsList = await request('GET', '/api/jobs');
    console.log(jobsList);

    console.log('[demo] Listando aplicaciones del job');
    const applicationsList = await request('GET', `/api/jobs/${job.job_id}/applications`);
    console.log(applicationsList);

    console.log('[demo] Operación completada correctamente.');
  } finally {
    console.log('[demo] Deteniendo servidor...');
    await stopServer();
  }
}

main().catch((error) => {
  console.error('[demo] Error durante la demostración:', error);
  process.exit(1);
});
