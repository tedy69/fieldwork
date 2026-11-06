import { useEffect, useRef, useState } from 'react';

type View = 'orders' | 'outbox' | 'resources';
type Destination = {
  view: View;
  orderId: string | null;
  returnView?: View;
  returnFocus?: string;
};

const orderList: Destination = { view: 'orders', orderId: null };

export function useInspectionNavigation(userId: string) {
  const [destination, setDestination] = useState(orderList);
  const returning = useRef(false);

  function write(next: Destination, push = false) {
    const entry = { ...history.state, fieldworkWorkspace: { userId, destination: next } };
    if (push) history.pushState(entry, '');
    else history.replaceState(entry, '');
  }

  useEffect(() => {
    // A fresh notebook session starts at the list, including after an offline reload.
    write(orderList);
    function restore(event: PopStateEvent) {
      returning.current = false;
      const entry = event.state?.fieldworkWorkspace;
      setDestination(entry?.userId === userId ? entry.destination : orderList);
    }
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [userId]);

  function navigate(view: View) {
    const next = { view, orderId: null };
    write(next);
    setDestination(next);
  }

  function openInspection(orderId: string, returnFocus = '#main') {
    const next: Destination = {
      view: 'orders',
      orderId,
      returnView: destination.returnView ?? destination.view,
    };
    if (!destination.orderId) {
      write({ ...destination, returnFocus });
      write(next, true);
    } else {
      write(next);
    }
    setDestination(next);
  }

  function closeInspection() {
    if (returning.current) return;
    returning.current = true;
    history.back();
  }

  return { destination, navigate, openInspection, closeInspection };
}
