using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Fingerprint> Fingerprints => Set<Fingerprint>();
    public DbSet<AccessEvent> AccessEvents => Set<AccessEvent>();
    public DbSet<DeviceCommand> DeviceCommands => Set<DeviceCommand>();
    public DbSet<PhoneKey> PhoneKeys => Set<PhoneKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Username).IsRequired().HasMaxLength(64);
            entity.Property(u => u.PasswordHash).IsRequired();
            entity.HasIndex(u => u.Username).IsUnique();
        });

        modelBuilder.Entity<Member>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Name).IsRequired().HasMaxLength(64);
            entity.Property(m => m.Enabled).HasDefaultValue(true);
            entity.Property(m => m.PinSalt).HasMaxLength(32);
            entity.Property(m => m.PinHash).HasMaxLength(64);
        });

        modelBuilder.Entity<Fingerprint>(entity =>
        {
            entity.HasKey(f => f.Id);
            entity.Property(f => f.Label).IsRequired().HasMaxLength(64);
            entity.HasIndex(f => f.Slot).IsUnique();
            entity.HasOne(f => f.Member)
                .WithMany(m => m.Fingerprints)
                .HasForeignKey(f => f.MemberId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PhoneKey>(entity =>
        {
            entity.HasKey(k => k.Id);
            entity.Property(k => k.CredentialId).IsRequired();
            entity.Property(k => k.PublicKey).IsRequired();
            entity.Property(k => k.Label).IsRequired().HasMaxLength(64);
            entity.HasIndex(k => k.CredentialId).IsUnique();
            entity.HasOne(k => k.Member)
                .WithMany(m => m.PhoneKeys)
                .HasForeignKey(k => k.MemberId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccessEvent>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.Method).HasConversion<string>().HasMaxLength(32);
            entity.Property(e => e.MemberName).HasMaxLength(64);
            entity.Property(e => e.Username).HasMaxLength(64);
            entity.HasIndex(e => e.OccurredAt);
        });

        modelBuilder.Entity<DeviceCommand>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Type).HasConversion<string>().HasMaxLength(32);
            entity.Property(c => c.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(c => c.Method).HasConversion<string>().HasMaxLength(32);
            entity.Property(c => c.Label).HasMaxLength(64);
            entity.Property(c => c.Step).HasMaxLength(32);
            entity.Property(c => c.Message).HasMaxLength(256);
            entity.Property(c => c.CreatedBy).IsRequired().HasMaxLength(64);
            entity.Ignore(c => c.IsActive);
            entity.HasIndex(c => new { c.Status, c.CreatedAt });
        });
    }
}
