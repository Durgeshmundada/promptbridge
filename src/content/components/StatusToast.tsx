interface StatusToastProps {
  message: string;
  isError: boolean;
}

export function StatusToast({ message, isError }: StatusToastProps): JSX.Element | null {
  if (!message) {
    return null;
  }

  return (
    <div className={isError ? 'pb-content-toast pb-content-toast-error' : 'pb-content-toast'}>
      {message}
    </div>
  );
}
