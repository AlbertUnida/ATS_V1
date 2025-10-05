import { useState } from 'react';

export function useModal(initial = false) {
  const [open, setOpen] = useState(initial);
  const openModal = () => setOpen(true);
  const closeModal = () => setOpen(false);
  const toggleModal = () => setOpen((value) => !value);
  return { open, openModal, closeModal, toggleModal };
}
