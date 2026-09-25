namespace SmartDoor.Api.Mqtt;

// Wakes the MQTT publisher the moment a command is queued (e.g. an app unlock)
// instead of waiting for its next round.
public interface IDoorCommandSignal
{
    void Notify();
    Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken);
}

public sealed class DoorCommandSignal : IDoorCommandSignal
{
    private readonly SemaphoreSlim signal = new(0, 1);

    public void Notify()
    {
        try
        {
            signal.Release();
        }
        catch (SemaphoreFullException)
        {
            // Already signalled — one wake-up is enough.
        }
    }

    public Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) =>
        signal.WaitAsync(timeout, cancellationToken);
}
