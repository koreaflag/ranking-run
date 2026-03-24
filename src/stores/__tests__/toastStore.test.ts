import { useToastStore } from '../toastStore';

// Reset store state before each test
beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('toastStore', () => {
  it('starts with empty toasts array', () => {
    const { toasts } = useToastStore.getState();
    expect(toasts).toEqual([]);
  });

  it('showToast adds a toast with correct type and message', () => {
    useToastStore.getState().showToast('success', 'Saved!');

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].message).toBe('Saved!');
    expect(toasts[0].id).toBeDefined();
  });

  it('showToast supports error and info types', () => {
    const { showToast } = useToastStore.getState();
    showToast('error', 'Something failed');
    showToast('info', 'FYI');

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(2);
    expect(toasts[0].type).toBe('error');
    expect(toasts[1].type).toBe('info');
  });

  it('limits toasts to MAX_TOASTS (3)', () => {
    const { showToast } = useToastStore.getState();
    showToast('info', 'First');
    showToast('info', 'Second');
    showToast('info', 'Third');
    showToast('info', 'Fourth');

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(3);
    // Oldest toast should be removed
    expect(toasts[0].message).toBe('Second');
    expect(toasts[2].message).toBe('Fourth');
  });

  it('removeToast removes a specific toast by id', () => {
    useToastStore.getState().showToast('success', 'Keep me');
    useToastStore.getState().showToast('error', 'Remove me');

    const toastToRemove = useToastStore.getState().toasts[1];
    useToastStore.getState().removeToast(toastToRemove.id);

    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Keep me');
  });

  it('auto-dismisses toast after 3000ms', () => {
    useToastStore.getState().showToast('info', 'Bye soon');
    expect(useToastStore.getState().toasts).toHaveLength(1);

    jest.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('removeToast with non-existent id does nothing', () => {
    useToastStore.getState().showToast('info', 'Stays');
    useToastStore.getState().removeToast('non-existent-id');

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
