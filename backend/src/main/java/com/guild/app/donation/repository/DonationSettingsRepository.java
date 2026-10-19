package com.guild.app.donation.repository;

import com.guild.app.donation.entity.DonationSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DonationSettingsRepository extends JpaRepository<DonationSettings, Short> {
}
