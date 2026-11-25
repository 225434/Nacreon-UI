export function launchBrowser(engine) {
  const configured = process.env['NACREON_' + engine.name().toUpperCase() + '_EXECUTABLE'];
  return engine.launch({ executablePath: configured || engine.executablePath() });
}
