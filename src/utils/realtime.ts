const DATA_CHANGED_EVENT = 'salaam-data-changed';

export const notifyDataChanged = () => {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
};

export const onDataChanged = (handler: () => void) => {
  window.addEventListener(DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
};
