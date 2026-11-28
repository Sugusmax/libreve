// Las notificaciones programadas no están disponibles en la versión web.
export async function syncDailyRecommendation(_force = false): Promise<void> {}
export async function isNotificationsEnabled(): Promise<boolean> {
  return false;
}
export async function setNotificationsEnabled(_enabled: boolean): Promise<boolean> {
  return false;
}
export async function cancelNotifications(): Promise<void> {}
