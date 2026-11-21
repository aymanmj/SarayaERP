const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "..");
const composeFile = path.join(repo, "docker-compose.pacs.yml");
const files = ["index.dump", "objects.tar"];
const databaseArgs = ["-U", "orthanc", "-d", "orthanc"];

function docker(args, options) {
  return execFileSync("docker", args, {
    cwd: repo,
    encoding: "utf8",
    ...options,
  });
}

async function fingerprint(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.size === 0)
    throw new Error(`Invalid backup component: ${path.basename(filename)}`);
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return { bytes: stat.size, sha256: hash.digest("hex") };
}

function transfer(compose, args, file, direction) {
  const fd = fs.openSync(file, direction === "read" ? "r" : "wx", 0o600);
  try {
    compose(args, {
      stdio:
        direction === "read"
          ? [fd, "inherit", "inherit"]
          : ["ignore", fd, "inherit"],
    });
    if (direction === "write") fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

async function backup(compose, directory, images) {
  if (fs.existsSync(directory))
    throw new Error("Backup destination already exists");
  const ids = [
    compose(["ps", "-q", "orthanc"]).trim(),
    compose(["ps", "-q", "pacs-db"]).trim(),
  ];
  for (const id of ids) {
    if (
      !/^[a-f0-9]+$/u.test(id) ||
      docker(["inspect", "--format", "{{.State.Health.Status}}", id]).trim() !==
        "healthy" ||
      !images.includes(
        docker(["inspect", "--format", "{{.Config.Image}}", id]).trim(),
      )
    )
      throw new Error(
        "Orthanc and its PostgreSQL index must be healthy and match the pinned images before backup",
      );
  }
  const temporary = fs.mkdtempSync(
    path.join(path.dirname(directory), ".pacs-backup-"),
  );
  let captureError;
  let restartError;
  try {
    try {
      // Stop the only writer so attachments and index come from the same point in time.
      compose(["stop", "--timeout", "60", "orthanc"], { stdio: "inherit" });
      if (
        docker([
          "inspect",
          "--format",
          "{{.State.Status}}/{{.State.ExitCode}}",
          ids[0],
        ]).trim() !== "exited/0"
      )
        throw new Error(
          "Orthanc did not exit cleanly; the backup was not published",
        );
      transfer(
        compose,
        [
          "exec",
          "-T",
          "pacs-db",
          "pg_dump",
          "--format=custom",
          ...databaseArgs,
        ],
        path.join(temporary, files[0]),
        "write",
      );
      transfer(
        compose,
        [
          "run",
          "--rm",
          "--no-deps",
          "-T",
          "--entrypoint",
          "tar",
          "orthanc",
          "-C",
          "/var/lib/orthanc/db",
          "-cf",
          "-",
          ".",
        ],
        path.join(temporary, files[1]),
        "write",
      );
    } catch (error) {
      captureError = error;
    }
    try {
      compose(["start", "--wait", "--wait-timeout", "120", "orthanc"], {
        stdio: "inherit",
      });
    } catch (error) {
      restartError = error;
    }
    if (captureError) throw captureError;
    // Work from the captured files once clients can use Orthanc again.
    const components = Object.fromEntries(
      await Promise.all(
        files.map(async (name) => [
          name,
          await fingerprint(path.join(temporary, name)),
        ]),
      ),
    );
    fs.writeFileSync(
      path.join(temporary, "manifest.json"),
      JSON.stringify(
        { format: 1, createdAt: new Date().toISOString(), images, components },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx", flush: true },
    );
    if (fs.existsSync(directory))
      throw new Error("Backup destination already exists");
    fs.renameSync(temporary, directory);
    console.log(`Paired PACS backup written to ${directory}`);
  } catch (error) {
    if (restartError)
      throw new AggregateError(
        [error, restartError],
        "Backup and Orthanc restart failed",
      );
    throw error;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  if (restartError) throw restartError;
}

async function restore(compose, project, directory, images) {
  const label = `label=com.docker.compose.project=${project}`;
  for (const args of [
    ["ps", "-aq"],
    ["volume", "ls", "-q"],
    ["network", "ls", "-q"],
  ]) {
    if (docker([...args, "--filter", label]).trim())
      throw new Error(
        "Restore requires a fresh Docker project with no existing resources",
      );
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  if (
    manifest.format !== 1 ||
    JSON.stringify(manifest.images) !== JSON.stringify(images)
  )
    throw new Error(
      "Backup format or archive image versions differ from this deployment",
    );
  for (const name of files) {
    const actual = await fingerprint(path.join(directory, name));
    const expected = manifest.components?.[name];
    if (actual.bytes !== expected?.bytes || actual.sha256 !== expected?.sha256)
      throw new Error(`Backup checksum mismatch: ${name}`);
  }
  compose(
    [
      "up",
      "-d",
      "--pull",
      "never",
      "--wait",
      "--wait-timeout",
      "120",
      "pacs-db",
    ],
    {
      stdio: "inherit",
    },
  );
  transfer(
    compose,
    [
      "exec",
      "-T",
      "pacs-db",
      "pg_restore",
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      ...databaseArgs,
    ],
    path.join(directory, files[0]),
    "read",
  );
  transfer(
    compose,
    [
      "run",
      "--rm",
      "--no-deps",
      "-T",
      "--entrypoint",
      "tar",
      "orthanc",
      "-C",
      "/var/lib/orthanc/db",
      "-xpf",
      "-",
    ],
    path.join(directory, files[1]),
    "read",
  );
  compose(
    [
      "up",
      "-d",
      "--pull",
      "never",
      "--wait",
      "--wait-timeout",
      "120",
      "orthanc",
    ],
    {
      stdio: "inherit",
    },
  );
  console.log(`PACS backup restored to isolated project ${project}`);
}

async function main() {
  const [action, project, directory, ...extra] = process.argv.slice(2);
  if (
    !["backup", "restore"].includes(action) ||
    !/^[a-z0-9][a-z0-9_-]{0,49}$/u.test(project ?? "") ||
    !directory ||
    extra.length
  ) {
    throw new Error(
      "Usage: node scripts/orthanc-archive.cjs <backup|restore> <compose-project> <backup-directory>",
    );
  }
  // A restored archive only listens on loopback with an empty DICOM modality allowlist.
  const env = { ...process.env, COMPOSE_IGNORE_ORPHANS: "true" };
  if (action === "restore")
    Object.assign(env, {
      PACS_DICOM_BIND_IP: "127.0.0.1",
      PACS_DICOM_PORT: "0",
      PACS_DICOM_MODALITIES: "{}",
    });
  const compose = (args, options) =>
    docker(["compose", "-f", composeFile, "-p", project, ...args], {
      env,
      ...options,
    });
  const images = compose(["config", "--images"]).trim().split(/\r?\n/u).sort();
  const lockName = `${project}-orthanc-maintenance`;
  const lockImage = images.find((image) =>
    image.startsWith("postgres@sha256:"),
  );
  if (!lockImage) throw new Error("Expected the pinned PACS PostgreSQL image");
  const lock = docker([
    "create",
    "--pull=never",
    "--name",
    lockName,
    "--label",
    "saraya.purpose=pacs-maintenance",
    "--entrypoint",
    "true",
    lockImage,
  ]).trim();
  try {
    if (action === "backup")
      await backup(compose, path.resolve(directory), images);
    else await restore(compose, project, path.resolve(directory), images);
  } finally {
    docker(["rm", lock]);
  }
}

main().catch((error) => {
  console.error(error instanceof AggregateError ? error : error.message);
  process.exitCode = 1;
});
